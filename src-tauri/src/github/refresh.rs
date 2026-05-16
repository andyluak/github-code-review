use serde::{Deserialize, Serialize};

use crate::github::gh::{parse_graphql, GhRunner, RealGh};
use crate::github::remote::resolve_github_repo;
use crate::github::types::{ChecksState, ChecksSummary, PullRequestHeadProbe};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RefreshPullRequestHeadRequest {
    pub repo_path: String,
    pub number: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshPullRequestHeadResponse {
    pub probe: PullRequestHeadProbe,
}

const PROBE_QUERY: &str = r#"
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      headRefOid updatedAt mergeable mergeStateStatus reviewDecision
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              state
              contexts(first: 100) {
                nodes {
                  __typename
                  ... on CheckRun { conclusion status }
                  ... on StatusContext { state }
                }
              }
            }
          }
        }
      }
    }
  }
}
"#;

#[derive(Debug, Deserialize)]
struct ProbeResponse {
    data: ProbeData,
}

#[derive(Debug, Deserialize)]
struct ProbeData {
    repository: Option<RepoNode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoNode {
    pull_request: Option<PrNode>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct PrNode {
    head_ref_oid: String,
    updated_at: String,
    mergeable: Option<String>,
    merge_state_status: Option<String>,
    review_decision: Option<String>,
    commits: Option<CommitsConn>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct CommitsConn {
    nodes: Vec<CommitConnNode>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct CommitConnNode {
    commit: CommitNode,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct CommitNode {
    status_check_rollup: Option<StatusCheckRollup>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct StatusCheckRollup {
    state: Option<String>,
    contexts: Option<ContextsConn>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
struct ContextsConn {
    nodes: Vec<ContextItemNode>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ContextItemNode {
    #[serde(rename = "__typename")]
    typename: Option<String>,
    conclusion: Option<String>,
    status: Option<String>,
    state: Option<String>,
}

pub fn fetch_pr_head_probe(
    gh: &dyn GhRunner,
    owner: &str,
    repo: &str,
    number: i64,
) -> Result<PullRequestHeadProbe, String> {
    let body = gh.run(
        &[
            "api",
            "graphql",
            "-f",
            &format!("query={PROBE_QUERY}"),
            "-f",
            &format!("owner={owner}"),
            "-f",
            &format!("repo={repo}"),
            "-F",
            &format!("number={number}"),
        ],
        None,
    )?;
    let response: ProbeResponse = parse_graphql(&body)?;
    let pr = response
        .data
        .repository
        .and_then(|r| r.pull_request)
        .ok_or_else(|| format!("Pull request {number} not found in {owner}/{repo}"))?;
    let checks_summary = pr
        .commits
        .as_ref()
        .and_then(|c| c.nodes.first())
        .and_then(|n| n.commit.status_check_rollup.as_ref())
        .map(parse_checks_summary)
        .unwrap_or_default();
    Ok(PullRequestHeadProbe {
        head_ref_oid: pr.head_ref_oid,
        updated_at: pr.updated_at,
        checks_summary,
        merge_state_status: pr.merge_state_status.unwrap_or_else(|| "UNKNOWN".into()),
        mergeable: pr.mergeable,
        review_decision: pr.review_decision,
    })
}

fn parse_checks_summary(rollup: &StatusCheckRollup) -> ChecksSummary {
    let mut passing = 0u32;
    let mut pending = 0u32;
    let mut failing = 0u32;
    let mut total = 0u32;
    if let Some(contexts) = &rollup.contexts {
        for node in &contexts.nodes {
            total += 1;
            let typename = node.typename.as_deref().unwrap_or("");
            if typename == "CheckRun" {
                let status = node.status.as_deref().unwrap_or("");
                let conclusion = node.conclusion.as_deref().unwrap_or("");
                if status == "COMPLETED" {
                    match conclusion {
                        "SUCCESS" | "NEUTRAL" | "SKIPPED" => passing += 1,
                        "FAILURE" | "TIMED_OUT" | "STARTUP_FAILURE" | "ACTION_REQUIRED"
                        | "CANCELLED" => failing += 1,
                        _ => pending += 1,
                    }
                } else {
                    pending += 1;
                }
            } else if typename == "StatusContext" {
                let state = node.state.as_deref().unwrap_or("");
                match state {
                    "SUCCESS" => passing += 1,
                    "FAILURE" | "ERROR" => failing += 1,
                    "PENDING" | "EXPECTED" => pending += 1,
                    _ => pending += 1,
                }
            }
        }
    }
    let state = match rollup.state.as_deref().unwrap_or("") {
        "SUCCESS" => ChecksState::Passing,
        "FAILURE" | "ERROR" => ChecksState::Failing,
        "PENDING" | "EXPECTED" => ChecksState::Pending,
        _ if total == 0 => ChecksState::Unknown,
        _ if failing > 0 => ChecksState::Failing,
        _ if pending > 0 => ChecksState::Pending,
        _ if passing > 0 => ChecksState::Passing,
        _ => ChecksState::Unknown,
    };
    ChecksSummary {
        state,
        passing,
        pending,
        failing,
        total,
    }
}

pub fn assert_expected_head(current: &PullRequestHeadProbe, expected: &str) -> Result<(), String> {
    if current.head_ref_oid == expected {
        Ok(())
    } else {
        Err(format!(
            "PR head moved: expected {expected}, got {}",
            current.head_ref_oid
        ))
    }
}

pub fn run_refresh_pull_request_head(
    gh: &dyn GhRunner,
    request: &RefreshPullRequestHeadRequest,
) -> Result<RefreshPullRequestHeadResponse, String> {
    let repo_root = crate::review::resolve_repo_root(&request.repo_path)?;
    let repo = resolve_github_repo(&repo_root)?;
    let probe = fetch_pr_head_probe(gh, &repo.owner, &repo.repo, request.number)?;
    Ok(RefreshPullRequestHeadResponse { probe })
}

#[tauri::command]
pub fn refresh_pull_request_head(
    request: RefreshPullRequestHeadRequest,
) -> Result<RefreshPullRequestHeadResponse, String> {
    run_refresh_pull_request_head(&RealGh, &request)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::github::gh::FakeGh;

    #[test]
    fn parses_head_probe() {
        let body = r#"{"data":{"repository":{"pullRequest":{
            "headRefOid":"abc","updatedAt":"2026-01-01T00:00:00Z",
            "mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","reviewDecision":null,
            "commits":{"nodes":[]}
        }}}}"#;
        let fake = FakeGh::new(vec![Ok(body.into())]);
        let probe = fetch_pr_head_probe(&fake, "o", "r", 1).unwrap();
        assert_eq!(probe.head_ref_oid, "abc");
        assert_eq!(probe.merge_state_status, "CLEAN");
    }

    #[test]
    fn assert_expected_head_matches() {
        let probe = PullRequestHeadProbe {
            head_ref_oid: "abc".into(),
            updated_at: "now".into(),
            checks_summary: ChecksSummary::default(),
            merge_state_status: "CLEAN".into(),
            mergeable: None,
            review_decision: None,
        };
        assert!(assert_expected_head(&probe, "abc").is_ok());
        assert!(assert_expected_head(&probe, "xyz").is_err());
    }
}
