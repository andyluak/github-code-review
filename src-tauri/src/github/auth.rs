use crate::github::gh::{parse_graphql, GhRunner, RealGh};
use crate::github::types::GitHubViewer;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct ViewerResponse {
    data: ViewerData,
}

#[derive(Debug, Deserialize)]
struct ViewerData {
    viewer: ViewerNode,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ViewerNode {
    login: String,
    name: Option<String>,
    avatar_url: Option<String>,
}

pub fn fetch_viewer(gh: &dyn GhRunner) -> Result<GitHubViewer, String> {
    let body = gh.run(
        &[
            "api",
            "graphql",
            "-f",
            "query=query{viewer{login name avatarUrl}}",
        ],
        None,
    )?;
    let response: ViewerResponse = parse_graphql(&body)?;
    Ok(GitHubViewer {
        login: response.data.viewer.login,
        name: response.data.viewer.name,
        avatar_url: response.data.viewer.avatar_url,
    })
}

#[tauri::command]
pub async fn get_github_viewer() -> Result<GitHubViewer, String> {
    crate::blocking::run("get_github_viewer", move || fetch_viewer(&RealGh)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::github::gh::FakeGh;

    #[test]
    fn fetches_and_parses_viewer() {
        let fake = FakeGh::new(vec![Ok(
            r#"{"data":{"viewer":{"login":"alex","name":"Alex T","avatarUrl":"http://x"}}}"#.into(),
        )]);
        let viewer = fetch_viewer(&fake).unwrap();
        assert_eq!(viewer.login, "alex");
        assert_eq!(viewer.name.as_deref(), Some("Alex T"));
        assert_eq!(viewer.avatar_url.as_deref(), Some("http://x"));
    }

    #[test]
    fn surfaces_gh_errors() {
        let fake = FakeGh::new(vec![Err("not authenticated".into())]);
        let err = fetch_viewer(&fake).unwrap_err();
        assert!(err.contains("not authenticated"));
    }
}
