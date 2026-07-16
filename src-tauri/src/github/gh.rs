use serde::de::DeserializeOwned;
use std::path::{Path, PathBuf};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

const GH_TIMEOUT: Duration = Duration::from_secs(15);
const GH_POLL_INTERVAL: Duration = Duration::from_millis(25);

pub trait GhRunner: Send + Sync {
    fn run(&self, args: &[&str], stdin: Option<&str>) -> Result<String, String>;
}

pub struct RealGh;

impl GhRunner for RealGh {
    fn run(&self, args: &[&str], stdin: Option<&str>) -> Result<String, String> {
        run_gh_command(None, args, stdin)
    }
}

pub fn run_gh_command(
    current_dir: Option<&Path>,
    args: &[&str],
    stdin: Option<&str>,
) -> Result<String, String> {
    use std::io::{Read, Write};
    use std::process::{Command, Stdio};

    let mut cmd = Command::new(resolve_gh_command());
    if let Some(dir) = current_dir {
        cmd.current_dir(dir);
    }
    cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
    if stdin.is_some() {
        cmd.stdin(Stdio::piped());
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| classify_gh_error(&format!("spawn gh: {e}")))?;
    let stdout = child.stdout.take().map(|mut pipe| {
        std::thread::spawn(move || {
            let mut output = Vec::new();
            pipe.read_to_end(&mut output)
                .map(|_| output)
                .map_err(|e| format!("read gh stdout: {e}"))
        })
    });
    let stderr = child.stderr.take().map(|mut pipe| {
        std::thread::spawn(move || {
            let mut output = Vec::new();
            pipe.read_to_end(&mut output)
                .map(|_| output)
                .map_err(|e| format!("read gh stderr: {e}"))
        })
    });

    if let (Some(stdin_data), Some(mut sink)) = (stdin, child.stdin.take()) {
        if let Err(error) = sink.write_all(stdin_data.as_bytes()) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = join_pipe(stdout, "stdout");
            let _ = join_pipe(stderr, "stderr");
            return Err(classify_gh_error(&format!("write gh stdin: {error}")));
        }
    }

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = join_pipe(stdout, "stdout")?;
                let stderr = join_pipe(stderr, "stderr")?;
                if !status.success() {
                    return Err(classify_gh_error(&String::from_utf8_lossy(&stderr)));
                }
                return Ok(String::from_utf8_lossy(&stdout).to_string());
            }
            Ok(None) if started.elapsed() >= GH_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = join_pipe(stdout, "stdout");
                let _ = join_pipe(stderr, "stderr");
                return Err(format!(
                    "GitHub request timed out after {}s. Local review data is still usable; retry GitHub refresh when the network is responsive.",
                    GH_TIMEOUT.as_secs()
                ));
            }
            Ok(None) => std::thread::sleep(GH_POLL_INTERVAL),
            Err(error) => return Err(classify_gh_error(&format!("wait gh: {error}"))),
        }
    }
}

fn resolve_gh_command() -> PathBuf {
    if let Some(path) = find_executable_in_path("gh") {
        return path;
    }

    for candidate in ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"] {
        let path = PathBuf::from(candidate);
        if is_executable(&path) {
            return path;
        }
    }

    PathBuf::from("gh")
}

fn find_executable_in_path(command: &str) -> Option<PathBuf> {
    let paths = std::env::var_os("PATH")?;
    std::env::split_paths(&paths)
        .map(|path| path.join(command))
        .find(|path| is_executable(path))
}

fn is_executable(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        return path
            .metadata()
            .map(|metadata| metadata.permissions().mode() & 0o111 != 0)
            .unwrap_or(false);
    }

    #[cfg(not(unix))]
    {
        true
    }
}

fn join_pipe(
    handle: Option<JoinHandle<Result<Vec<u8>, String>>>,
    label: &str,
) -> Result<Vec<u8>, String> {
    let Some(handle) = handle else {
        return Ok(Vec::new());
    };
    handle
        .join()
        .map_err(|_| format!("read gh {label}: reader thread panicked"))?
        .map_err(|error| classify_gh_error(&error))
}

fn classify_gh_error(error: &str) -> String {
    let trimmed = error.trim();
    if trimmed.is_empty() {
        return "GitHub command failed without an error message.".to_string();
    }

    let lower = trimmed.to_ascii_lowercase();
    let reason = if lower.contains("secondary rate limit") {
        Some("GitHub secondary rate limit hit")
    } else if lower.contains("rate limit") {
        Some("GitHub rate limit hit")
    } else if lower.contains("not logged into")
        || lower.contains("authentication")
        || lower.contains("gh auth login")
        || lower.contains("bad credentials")
    {
        Some("GitHub authentication failed")
    } else if lower.contains("saml") || lower.contains("sso") {
        Some("GitHub organization SSO is not authorized")
    } else if lower.contains("permission") || lower.contains("forbidden") {
        Some("GitHub permission denied")
    } else {
        None
    };

    match reason {
        Some(prefix) => format!("{prefix}: {trimmed}"),
        None => trimmed.to_string(),
    }
}

pub fn parse_graphql<T: DeserializeOwned>(body: &str) -> Result<T, String> {
    serde_json::from_str(body).map_err(|e| format!("parse graphql: {e}"))
}

#[cfg(test)]
pub struct FakeGh {
    pub responses: std::sync::Mutex<Vec<Result<String, String>>>,
    pub calls: std::sync::Mutex<Vec<(Vec<String>, Option<String>)>>,
}

#[cfg(test)]
impl FakeGh {
    pub fn new(responses: Vec<Result<String, String>>) -> Self {
        Self {
            responses: std::sync::Mutex::new(responses),
            calls: std::sync::Mutex::new(Vec::new()),
        }
    }
}

#[cfg(test)]
impl GhRunner for FakeGh {
    fn run(&self, args: &[&str], stdin: Option<&str>) -> Result<String, String> {
        self.calls.lock().unwrap().push((
            args.iter().map(|a| (*a).to_string()).collect(),
            stdin.map(str::to_string),
        ));
        let mut responses = self.responses.lock().unwrap();
        if responses.is_empty() {
            return Err("FakeGh exhausted".into());
        }
        responses.remove(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fake_returns_canned_response_and_records_call() {
        let fake = FakeGh::new(vec![Ok("{\"ok\":true}".to_string())]);
        let out = fake.run(&["api", "graphql"], Some("query{}")).unwrap();
        assert_eq!(out, "{\"ok\":true}");
        let calls = fake.calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, vec!["api".to_string(), "graphql".to_string()]);
        assert_eq!(calls[0].1.as_deref(), Some("query{}"));
    }

    #[test]
    fn fake_returns_error_when_exhausted() {
        let fake = FakeGh::new(vec![]);
        let err = fake.run(&["api"], None).unwrap_err();
        assert!(err.contains("exhausted"));
    }

    #[test]
    fn classifies_rate_limit_errors() {
        let err = classify_gh_error("API rate limit exceeded");
        assert!(err.starts_with("GitHub rate limit hit"));
    }

    #[test]
    fn classifies_auth_errors() {
        let err = classify_gh_error("not logged into any GitHub hosts");
        assert!(err.starts_with("GitHub authentication failed"));
    }
}
