use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitHubRepoRef {
    pub owner: String,
    pub repo: String,
}

pub fn parse_github_remote(url: &str) -> Option<GitHubRepoRef> {
    let trimmed = url.trim();
    let (host, path) = if let Some(rest) = trimmed.strip_prefix("git@") {
        let mut parts = rest.splitn(2, ':');
        (parts.next()?, parts.next()?)
    } else if let Some(rest) = trimmed.strip_prefix("ssh://git@") {
        let mut parts = rest.splitn(2, '/');
        (parts.next()?, parts.next()?)
    } else if let Some(rest) = trimmed.strip_prefix("https://") {
        let mut parts = rest.splitn(2, '/');
        (parts.next()?, parts.next()?)
    } else if let Some(rest) = trimmed.strip_prefix("http://") {
        let mut parts = rest.splitn(2, '/');
        (parts.next()?, parts.next()?)
    } else {
        return None;
    };
    if !host.contains("github.com") {
        return None;
    }
    let cleaned = path.trim_end_matches(".git").trim_end_matches('/');
    let mut segments = cleaned.splitn(2, '/');
    let owner = segments.next()?;
    let repo = segments.next()?;
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some(GitHubRepoRef {
        owner: owner.to_string(),
        repo: repo.to_string(),
    })
}

pub fn read_default_remote_url(repo_root: &Path) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_root)
        .arg("remote")
        .arg("-v")
        .output()
        .map_err(|error| format!("Failed to run git remote -v: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    // Prefer `origin` fetch URL; otherwise the first fetch URL.
    let mut origin_fetch: Option<String> = None;
    let mut first_fetch: Option<String> = None;
    for line in stdout.lines() {
        let mut parts = line.split_whitespace();
        let Some(name) = parts.next() else { continue };
        let Some(url) = parts.next() else { continue };
        let direction = parts.next().unwrap_or_default();
        if !direction.contains("fetch") {
            continue;
        }
        if first_fetch.is_none() {
            first_fetch = Some(url.to_string());
        }
        if name == "origin" {
            origin_fetch = Some(url.to_string());
        }
    }
    origin_fetch
        .or(first_fetch)
        .ok_or_else(|| "No git remotes configured".to_string())
}

pub fn resolve_github_repo(repo_root: &Path) -> Result<GitHubRepoRef, String> {
    let url = read_default_remote_url(repo_root)?;
    parse_github_remote(&url)
        .ok_or_else(|| format!("Remote URL is not a GitHub repo: {url}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ssh_remote() {
        let r = parse_github_remote("git@github.com:anthropic/apps.git").unwrap();
        assert_eq!(r.owner, "anthropic");
        assert_eq!(r.repo, "apps");
    }

    #[test]
    fn parses_https_remote_without_dot_git() {
        let r = parse_github_remote("https://github.com/foo/bar").unwrap();
        assert_eq!(r.owner, "foo");
        assert_eq!(r.repo, "bar");
    }

    #[test]
    fn parses_ssh_protocol_remote() {
        let r = parse_github_remote("ssh://git@github.com/foo/bar.git").unwrap();
        assert_eq!(r.owner, "foo");
        assert_eq!(r.repo, "bar");
    }

    #[test]
    fn rejects_non_github() {
        assert_eq!(parse_github_remote("git@gitlab.com:foo/bar.git"), None);
    }

    #[test]
    fn rejects_empty_segments() {
        assert_eq!(parse_github_remote("git@github.com:/bar.git"), None);
        assert_eq!(parse_github_remote("git@github.com:foo/.git"), None);
    }
}
