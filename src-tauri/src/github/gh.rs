use serde::de::DeserializeOwned;

pub trait GhRunner: Send + Sync {
    fn run(&self, args: &[&str], stdin: Option<&str>) -> Result<String, String>;
}

pub struct RealGh;

impl GhRunner for RealGh {
    fn run(&self, args: &[&str], stdin: Option<&str>) -> Result<String, String> {
        use std::io::Write;
        use std::process::{Command, Stdio};

        let mut cmd = Command::new("gh");
        cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
        if stdin.is_some() {
            cmd.stdin(Stdio::piped());
        }
        let mut child = cmd.spawn().map_err(|e| format!("spawn gh: {e}"))?;
        if let (Some(stdin_data), Some(mut sink)) = (stdin, child.stdin.take()) {
            sink.write_all(stdin_data.as_bytes())
                .map_err(|e| format!("write stdin: {e}"))?;
        }
        let output = child
            .wait_with_output()
            .map_err(|e| format!("wait gh: {e}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
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
}
