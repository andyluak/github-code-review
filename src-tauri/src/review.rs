use serde::{Deserialize, Serialize};
use std::{
    collections::{hash_map::DefaultHasher, HashSet},
    env, fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    process::Command,
};

const EMPTY_TREE_SHA: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReviewSessionRequest {
    repo_path: String,
    base_ref: Option<String>,
    head_ref: Option<String>,
    target: Option<ReviewTargetRequest>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum ReviewTargetRequest {
    WorkingTree,
    Branch {
        base_ref: String,
        head_ref: String,
    },
    Commit {
        commit: String,
    },
    CommitRange {
        from_ref: String,
        to_ref: String,
    },
    PullRequest {
        remote: Option<String>,
        number: Option<u64>,
        url: Option<String>,
        base_ref: Option<String>,
        head_ref: Option<String>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListReviewRefsRequest {
    repo_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReviewSessionRequest {
    manifest_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveReviewSessionRequest {
    repo_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSession {
    id: String,
    snapshot_hash: String,
    target: ReviewTarget,
    repo: RepoSummary,
    summary: SessionSummary,
    files: Vec<ReviewFile>,
    excluded_files: Vec<ExcludedFile>,
    patch_artifact: PatchArtifact,
    order: ReviewOrder,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepoSummary {
    requested_path: String,
    root: String,
    branch: String,
    head_sha: String,
    base_ref: Option<String>,
    head_ref: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionSummary {
    total_files: usize,
    included_files: usize,
    excluded_files: usize,
    additions: usize,
    deletions: usize,
    generated_excluded: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ReviewFile {
    id: String,
    path: String,
    patch_hash: String,
    old_path: Option<String>,
    change_kind: ChangeKind,
    additions: usize,
    deletions: usize,
    viewed_status: ViewedStatus,
    order_group: Option<String>,
    review_reason: Option<String>,
    agent_notes: Vec<AgentNote>,
    hunks: Vec<DiffHunk>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentNote {
    body: String,
    source: Option<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum ChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
}

#[derive(Debug, Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
enum ViewedStatus {
    Unseen,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DiffHunk {
    header: String,
    old_start: usize,
    old_lines: usize,
    new_start: usize,
    new_lines: usize,
    lines: Vec<DiffLine>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DiffLine {
    kind: DiffLineKind,
    old_line: Option<usize>,
    new_line: Option<usize>,
    diff_position: Option<usize>,
    content: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
enum DiffLineKind {
    Context,
    Addition,
    Deletion,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExcludedFile {
    path: String,
    reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PatchArtifact {
    strategy: String,
    file_count: usize,
    diff_target: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReviewOrder {
    source: ReviewOrderSource,
    title: Option<String>,
    created_by: Option<String>,
    manifest_path: Option<String>,
    groups: Vec<ReviewOrderGroup>,
    warnings: Vec<ReviewOrderWarning>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
enum ReviewOrderSource {
    Git,
    Agent,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReviewOrderGroup {
    title: String,
    file_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReviewOrderWarning {
    path: Option<String>,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveReviewSession {
    repo_root: String,
    manifest_path: String,
    activated_at: Option<String>,
    source: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoRefs {
    requested_path: String,
    root: String,
    current_branch: String,
    default_branch: Option<String>,
    head_sha: String,
    remotes: Vec<GitRemote>,
    refs: Vec<GitRef>,
    commits: Vec<GitCommit>,
    pull_requests: Vec<PullRequestSummary>,
    pull_request_error: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GitRemote {
    name: String,
    url: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GitCommit {
    sha: String,
    short_sha: String,
    title: String,
    author: String,
    date: String,
    refs: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GitRef {
    name: String,
    kind: GitRefKind,
    short_sha: String,
    is_head: bool,
    upstream: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PullRequestSummary {
    number: u64,
    title: String,
    base_ref_name: String,
    head_ref_name: String,
    head_ref_oid: String,
    url: String,
    state: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum ReviewTarget {
    WorkingTree {
        label: String,
    },
    Branch {
        base_ref: String,
        head_ref: String,
        label: String,
    },
    Commit {
        commit: String,
        label: String,
    },
    CommitRange {
        from_ref: String,
        to_ref: String,
        label: String,
    },
    PullRequest {
        remote: Option<String>,
        number: Option<u64>,
        url: Option<String>,
        base_ref: String,
        head_ref: String,
        label: String,
    },
}

struct ResolvedTarget {
    target: ReviewTarget,
    diff_target: Option<String>,
    session_key: String,
    base_ref: Option<String>,
    head_ref: Option<String>,
    include_untracked: bool,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum GitRefKind {
    Local,
    Remote,
}

struct ChangedPath {
    path: String,
    source: ChangeSource,
}

enum ChangeSource {
    Tracked,
    Untracked,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReviewSessionManifest {
    version: u32,
    #[serde(alias = "repoPath")]
    repo_root: String,
    #[serde(default)]
    base_ref: Option<String>,
    #[serde(default)]
    head_ref: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    created_by: Option<String>,
    #[serde(default)]
    file_order: Vec<ManifestFileOrder>,
    #[serde(default)]
    excluded_paths: Vec<ManifestExcludedPath>,
    #[serde(default)]
    agent_notes: Vec<ManifestAgentNote>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestFileOrder {
    path: String,
    #[serde(default)]
    group: Option<String>,
    #[serde(default)]
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestExcludedPath {
    path: String,
    #[serde(default)]
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestAgentNote {
    path: String,
    note: String,
    #[serde(default)]
    source: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActiveReviewSessionPointer {
    #[serde(default)]
    repo_root: Option<String>,
    manifest_path: String,
    #[serde(default)]
    activated_at: Option<String>,
    #[serde(default)]
    source: Option<String>,
}

#[tauri::command]
pub fn create_review_session(request: CreateReviewSessionRequest) -> Result<ReviewSession, String> {
    create_review_session_inner(request)
}

fn create_review_session_inner(
    request: CreateReviewSessionRequest,
) -> Result<ReviewSession, String> {
    let repo_root = repo_root(&request.repo_path)?;
    let branch = git_stdout(&repo_root, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();
    let head_sha = git_stdout(&repo_root, &["rev-parse", "--short", "HEAD"])?
        .trim()
        .to_string();

    let resolved_target = resolve_review_target(&repo_root, &request)?;
    let mut changed = changed_paths(
        &repo_root,
        resolved_target.diff_target.as_deref(),
        resolved_target.include_untracked,
    )?;
    let mut seen_paths = HashSet::new();
    changed.retain(|path| seen_paths.insert(path.path.clone()));

    let mut files = Vec::new();
    let mut excluded_files = Vec::new();
    let mut included_tracked_paths = Vec::new();
    let mut included_untracked_paths = Vec::new();

    for changed_path in &changed {
        if let Some(reason) = generated_reason(&changed_path.path) {
            excluded_files.push(ExcludedFile {
                path: changed_path.path.clone(),
                reason,
            });
            continue;
        }

        match changed_path.source {
            ChangeSource::Tracked => included_tracked_paths.push(changed_path.path.clone()),
            ChangeSource::Untracked => included_untracked_paths.push(changed_path.path.clone()),
        }
    }

    let tracked_files = tracked_file_patches(
        &repo_root,
        resolved_target.diff_target.as_deref(),
        &included_tracked_paths,
    )?;
    let tracked_by_path = tracked_files
        .into_iter()
        .map(|file| (file.path.clone(), file))
        .collect::<std::collections::HashMap<_, _>>();
    let untracked_by_path = included_untracked_paths
        .iter()
        .map(|path| untracked_file_patch(&repo_root, path).map(|file| (path.clone(), file)))
        .collect::<Result<std::collections::HashMap<_, _>, _>>()?;

    for changed_path in changed {
        if generated_reason(&changed_path.path).is_some() {
            continue;
        }

        let parsed = match changed_path.source {
            ChangeSource::Tracked => tracked_by_path.get(&changed_path.path).cloned(),
            ChangeSource::Untracked => untracked_by_path.get(&changed_path.path).cloned(),
        };

        if let Some(parsed) = parsed {
            if parsed.hunks.is_empty() {
                continue;
            }
            files.push(parsed);
        }
    }

    let additions = files.iter().map(|file| file.additions).sum();
    let deletions = files.iter().map(|file| file.deletions).sum();
    let total_files = files.len() + excluded_files.len();
    let session_id = session_id(&repo_root, &resolved_target.session_key);
    let snapshot_hash = snapshot_hash(&resolved_target.session_key, &files, &excluded_files);
    let generated_excluded = excluded_files.len();

    Ok(ReviewSession {
        id: session_id,
        snapshot_hash,
        target: resolved_target.target,
        repo: RepoSummary {
            requested_path: request.repo_path,
            root: repo_root.display().to_string(),
            branch,
            head_sha,
            base_ref: resolved_target.base_ref,
            head_ref: resolved_target.head_ref,
        },
        summary: SessionSummary {
            total_files,
            included_files: files.len(),
            excluded_files: excluded_files.len(),
            additions,
            deletions,
            generated_excluded,
        },
        files,
        excluded_files,
        patch_artifact: PatchArtifact {
            strategy: "git-diff-file-list".to_string(),
            file_count: total_files.saturating_sub(generated_excluded),
            diff_target: resolved_target
                .diff_target
                .unwrap_or_else(|| "HEAD".to_string()),
        },
        order: ReviewOrder {
            source: ReviewOrderSource::Git,
            title: None,
            created_by: None,
            manifest_path: None,
            groups: Vec::new(),
            warnings: Vec::new(),
        },
    })
}

#[tauri::command]
pub fn import_review_session(request: ImportReviewSessionRequest) -> Result<ReviewSession, String> {
    import_review_session_from_path(PathBuf::from(&request.manifest_path))
}

fn import_review_session_from_path(manifest_path: PathBuf) -> Result<ReviewSession, String> {
    let manifest_content = fs::read_to_string(&manifest_path).map_err(|error| {
        format!(
            "Failed to read review session manifest {}: {error}",
            manifest_path.display()
        )
    })?;
    let manifest: ReviewSessionManifest =
        serde_json::from_str(&manifest_content).map_err(|error| {
            format!(
                "Failed to parse review session manifest {}: {error}",
                manifest_path.display()
            )
        })?;

    if manifest.version != 1 {
        return Err(format!(
            "Unsupported review session manifest version {}",
            manifest.version
        ));
    }

    let mut session = create_review_session_inner(CreateReviewSessionRequest {
        repo_path: manifest.repo_root.clone(),
        base_ref: manifest.base_ref.clone(),
        head_ref: manifest.head_ref.clone(),
        target: None,
    })?;
    apply_manifest_order(&mut session, manifest, &manifest_path);
    Ok(session)
}

#[tauri::command]
pub fn get_active_review_session(
    request: ActiveReviewSessionRequest,
) -> Result<Option<ActiveReviewSession>, String> {
    let repo_root = repo_root(&request.repo_path)?;
    let pointer_path = active_review_session_path(&repo_root);
    if !pointer_path.exists() {
        return Ok(None);
    }

    let pointer_content = fs::read_to_string(&pointer_path).map_err(|error| {
        format!(
            "Failed to read active review session {}: {error}",
            pointer_path.display()
        )
    })?;
    let pointer: ActiveReviewSessionPointer =
        serde_json::from_str(&pointer_content).map_err(|error| {
            format!(
                "Failed to parse active review session {}: {error}",
                pointer_path.display()
            )
        })?;
    let manifest_path = resolve_manifest_path(&repo_root, &pointer.manifest_path);

    if !manifest_path.exists() {
        return Ok(None);
    }

    Ok(Some(ActiveReviewSession {
        repo_root: repo_root.display().to_string(),
        manifest_path: manifest_path.display().to_string(),
        activated_at: pointer.activated_at,
        source: pointer.source,
    }))
}

#[tauri::command]
pub fn import_active_review_session(
    request: ActiveReviewSessionRequest,
) -> Result<Option<ReviewSession>, String> {
    let repo_root = repo_root(&request.repo_path)?;
    let pointer_path = active_review_session_path(&repo_root);
    if !pointer_path.exists() {
        return Ok(None);
    }

    let pointer_content = fs::read_to_string(&pointer_path).map_err(|error| {
        format!(
            "Failed to read active review session {}: {error}",
            pointer_path.display()
        )
    })?;
    let pointer: ActiveReviewSessionPointer =
        serde_json::from_str(&pointer_content).map_err(|error| {
            format!(
                "Failed to parse active review session {}: {error}",
                pointer_path.display()
            )
        })?;
    let manifest_path = resolve_manifest_path(&repo_root, &pointer.manifest_path);
    if !manifest_path.exists() {
        return Ok(None);
    }

    import_review_session_from_path(manifest_path).map(Some)
}

#[tauri::command]
pub fn get_global_active_review_session() -> Result<Option<ActiveReviewSession>, String> {
    let Some(pointer_path) = global_active_review_session_path() else {
        return Ok(None);
    };
    if !pointer_path.exists() {
        return Ok(None);
    }

    let pointer_content = fs::read_to_string(&pointer_path).map_err(|error| {
        format!(
            "Failed to read global active review session {}: {error}",
            pointer_path.display()
        )
    })?;
    let pointer: ActiveReviewSessionPointer =
        serde_json::from_str(&pointer_content).map_err(|error| {
            format!(
                "Failed to parse global active review session {}: {error}",
                pointer_path.display()
            )
        })?;
    let Some(repo_root_value) = pointer.repo_root.as_deref() else {
        return Ok(None);
    };
    let repo_root = repo_root(repo_root_value)?;
    let manifest_path = resolve_manifest_path(&repo_root, &pointer.manifest_path);

    if !manifest_path.exists() {
        return Ok(None);
    }

    Ok(Some(ActiveReviewSession {
        repo_root: repo_root.display().to_string(),
        manifest_path: manifest_path.display().to_string(),
        activated_at: pointer.activated_at,
        source: pointer.source,
    }))
}

#[tauri::command]
pub fn import_global_active_review_session() -> Result<Option<ReviewSession>, String> {
    let Some(pointer_path) = global_active_review_session_path() else {
        return Ok(None);
    };
    if !pointer_path.exists() {
        return Ok(None);
    }

    let pointer_content = fs::read_to_string(&pointer_path).map_err(|error| {
        format!(
            "Failed to read global active review session {}: {error}",
            pointer_path.display()
        )
    })?;
    let pointer: ActiveReviewSessionPointer =
        serde_json::from_str(&pointer_content).map_err(|error| {
            format!(
                "Failed to parse global active review session {}: {error}",
                pointer_path.display()
            )
        })?;
    let Some(repo_root_value) = pointer.repo_root.as_deref() else {
        return Ok(None);
    };
    let repo_root = repo_root(repo_root_value)?;
    let manifest_path = resolve_manifest_path(&repo_root, &pointer.manifest_path);
    if !manifest_path.exists() {
        return Ok(None);
    }

    import_review_session_from_path(manifest_path).map(Some)
}

fn active_review_session_path(repo_root: &Path) -> PathBuf {
    repo_root.join(".review-desk").join("active-session.json")
}

fn global_active_review_session_path() -> Option<PathBuf> {
    env::var_os("HOME").map(|home| PathBuf::from(home).join(".review-desk/active-session.json"))
}

fn resolve_manifest_path(repo_root: &Path, manifest_path: &str) -> PathBuf {
    let path = PathBuf::from(manifest_path);
    if path.is_absolute() {
        path
    } else {
        repo_root.join(path)
    }
}

fn apply_manifest_order(
    session: &mut ReviewSession,
    manifest: ReviewSessionManifest,
    manifest_path: &Path,
) {
    let mut warnings = Vec::new();

    for excluded in manifest.excluded_paths {
        if let Some(index) = session
            .files
            .iter()
            .position(|file| file_matches_path(file, &excluded.path))
        {
            let file = session.files.remove(index);
            session.excluded_files.push(ExcludedFile {
                path: file.path,
                reason: excluded
                    .reason
                    .unwrap_or_else(|| "Excluded by agent manifest".to_string()),
            });
        } else if let Some(existing) = session
            .excluded_files
            .iter_mut()
            .find(|file| file.path == excluded.path)
        {
            if let Some(reason) = excluded.reason {
                existing.reason = reason;
            }
        } else {
            warnings.push(ReviewOrderWarning {
                path: Some(excluded.path),
                message: "Agent excluded path was not present in the diff".to_string(),
            });
        }
    }

    let mut remaining = std::mem::take(&mut session.files);
    let mut ordered = Vec::new();
    let mut groups = Vec::new();
    let mut seen_ordered_paths = HashSet::new();

    for ordered_file in manifest.file_order {
        if !seen_ordered_paths.insert(ordered_file.path.clone()) {
            warnings.push(ReviewOrderWarning {
                path: Some(ordered_file.path),
                message: "Duplicate file in agent review order".to_string(),
            });
            continue;
        }

        let Some(index) = remaining
            .iter()
            .position(|file| file_matches_path(file, &ordered_file.path))
        else {
            warnings.push(ReviewOrderWarning {
                path: Some(ordered_file.path),
                message: "Agent ordered file was not present in the diff".to_string(),
            });
            continue;
        };

        let mut file = remaining.remove(index);
        let group = ordered_file
            .group
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "Ordered by agent".to_string());
        file.order_group = Some(group.clone());
        file.review_reason = ordered_file.reason.filter(|value| !value.trim().is_empty());
        bump_group(&mut groups, &group);
        ordered.push(file);
    }

    if !remaining.is_empty() {
        let group = "Not ordered by agent".to_string();
        let remaining_count = remaining.len();
        for mut file in remaining {
            file.order_group = Some(group.clone());
            ordered.push(file);
        }
        bump_group_by(&mut groups, &group, remaining_count);
    }

    for agent_note in manifest.agent_notes {
        if let Some(file) = ordered
            .iter_mut()
            .find(|file| file_matches_path(file, &agent_note.path))
        {
            file.agent_notes.push(AgentNote {
                body: agent_note.note,
                source: agent_note.source,
            });
        } else {
            warnings.push(ReviewOrderWarning {
                path: Some(agent_note.path),
                message: "Agent note target was not present in the diff".to_string(),
            });
        }
    }

    session.files = ordered;
    session.id = manifest_session_id(
        &session.repo.root,
        session.patch_artifact.diff_target.as_str(),
        manifest_path,
        &session.files,
    );
    session.snapshot_hash = snapshot_hash(&session.id, &session.files, &session.excluded_files);
    session.patch_artifact.strategy = "agent-manifest".to_string();
    session.patch_artifact.file_count = session.files.len();
    session.order = ReviewOrder {
        source: ReviewOrderSource::Agent,
        title: manifest.title,
        created_by: manifest.created_by,
        manifest_path: Some(manifest_path.display().to_string()),
        groups: groups
            .into_iter()
            .filter(|group| {
                group.file_count > 0
                    && session
                        .files
                        .iter()
                        .any(|file| file.order_group.as_deref() == Some(group.title.as_str()))
            })
            .collect(),
        warnings,
    };
    refresh_summary(session);
}

fn file_matches_path(file: &ReviewFile, path: &str) -> bool {
    file.path == path || file.old_path.as_deref() == Some(path)
}

fn bump_group(groups: &mut Vec<ReviewOrderGroup>, title: &str) {
    bump_group_by(groups, title, 1);
}

fn bump_group_by(groups: &mut Vec<ReviewOrderGroup>, title: &str, amount: usize) {
    if amount == 0 {
        return;
    }

    if let Some(group) = groups.iter_mut().find(|group| group.title == title) {
        group.file_count += amount;
    } else {
        groups.push(ReviewOrderGroup {
            title: title.to_string(),
            file_count: amount,
        });
    }
}

fn refresh_summary(session: &mut ReviewSession) {
    let additions = session.files.iter().map(|file| file.additions).sum();
    let deletions = session.files.iter().map(|file| file.deletions).sum();
    let generated_excluded = session.excluded_files.len();

    session.summary = SessionSummary {
        total_files: session.files.len() + session.excluded_files.len(),
        included_files: session.files.len(),
        excluded_files: session.excluded_files.len(),
        additions,
        deletions,
        generated_excluded,
    };
}

#[tauri::command]
pub fn list_review_refs(request: ListReviewRefsRequest) -> Result<RepoRefs, String> {
    let repo_root = repo_root(&request.repo_path)?;
    let current_branch = git_stdout(&repo_root, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();
    let head_sha = git_stdout(&repo_root, &["rev-parse", "--short", "HEAD"])?
        .trim()
        .to_string();

    let mut refs = Vec::new();
    refs.extend(list_refs(&repo_root, GitRefKind::Local)?);
    refs.extend(list_refs(&repo_root, GitRefKind::Remote)?);

    let mut seen_refs = HashSet::new();
    refs.retain(|git_ref| seen_refs.insert(git_ref.name.clone()));
    refs.sort_by(|a, b| ref_weight(a).cmp(&ref_weight(b)).then(a.name.cmp(&b.name)));
    let pull_requests = list_pull_requests(&repo_root);

    Ok(RepoRefs {
        requested_path: request.repo_path,
        root: repo_root.display().to_string(),
        current_branch,
        default_branch: default_branch(&repo_root),
        head_sha,
        remotes: list_remotes(&repo_root)?,
        refs,
        commits: list_recent_commits(&repo_root)?,
        pull_requests: pull_requests.clone().unwrap_or_default(),
        pull_request_error: pull_requests.err(),
    })
}

fn repo_root(path: &str) -> Result<PathBuf, String> {
    let output = git_stdout(Path::new(path), &["rev-parse", "--show-toplevel"])?;
    Ok(PathBuf::from(output.trim()))
}

fn list_refs(repo_root: &Path, kind: GitRefKind) -> Result<Vec<GitRef>, String> {
    let root = match kind {
        GitRefKind::Local => "refs/heads",
        GitRefKind::Remote => "refs/remotes",
    };
    let output = git_stdout(
        repo_root,
        &[
            "for-each-ref",
            "--format=%(refname:short)%09%(objectname:short)%09%(upstream:short)",
            root,
        ],
    )?;
    let current_branch = git_stdout(repo_root, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();

    Ok(output
        .lines()
        .filter_map(|line| parse_ref_line(line, kind, &current_branch))
        .collect())
}

fn parse_ref_line(line: &str, kind: GitRefKind, current_branch: &str) -> Option<GitRef> {
    let mut parts = line.split('\t');
    let name = parts.next()?.trim();
    if name.is_empty() || name.ends_with("/HEAD") {
        return None;
    }

    Some(GitRef {
        name: name.to_string(),
        kind,
        short_sha: parts.next().unwrap_or_default().trim().to_string(),
        is_head: kind == GitRefKind::Local && name == current_branch,
        upstream: parts
            .next()
            .map(str::trim)
            .filter(|upstream| !upstream.is_empty())
            .map(ToString::to_string),
    })
}

fn default_branch(repo_root: &Path) -> Option<String> {
    let symbolic = git_stdout(
        repo_root,
        &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    )
    .ok()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty());
    if symbolic.is_some() {
        return symbolic;
    }

    ["origin/main", "main", "origin/master", "master"]
        .iter()
        .find(|candidate| git_ref_exists(repo_root, candidate))
        .map(|value| (*value).to_string())
}

fn list_remotes(repo_root: &Path) -> Result<Vec<GitRemote>, String> {
    let output = git_stdout(repo_root, &["remote", "-v"])?;
    let mut remotes = Vec::new();
    let mut seen = HashSet::new();

    for line in output.lines() {
        let mut parts = line.split_whitespace();
        let Some(name) = parts.next() else {
            continue;
        };
        let Some(url) = parts.next() else {
            continue;
        };
        let direction = parts.next().unwrap_or_default();
        if !direction.contains("fetch") || !seen.insert(name.to_string()) {
            continue;
        }
        remotes.push(GitRemote {
            name: name.to_string(),
            url: url.to_string(),
        });
    }

    Ok(remotes)
}

fn default_remote_name(repo_root: &Path) -> Option<String> {
    list_remotes(repo_root)
        .ok()
        .and_then(|remotes| remotes.into_iter().next().map(|remote| remote.name))
}

fn list_recent_commits(repo_root: &Path) -> Result<Vec<GitCommit>, String> {
    let output = git_stdout(
        repo_root,
        &[
            "log",
            "-100",
            "--date=iso-strict",
            "--pretty=format:%H%x09%h%x09%D%x09%an%x09%ad%x09%s",
        ],
    )?;

    Ok(output
        .lines()
        .filter_map(parse_commit_line)
        .collect::<Vec<_>>())
}

fn parse_commit_line(line: &str) -> Option<GitCommit> {
    let mut parts = line.splitn(6, '\t');
    Some(GitCommit {
        sha: parts.next()?.to_string(),
        short_sha: parts.next()?.to_string(),
        refs: parts.next().unwrap_or_default().to_string(),
        author: parts.next().unwrap_or_default().to_string(),
        date: parts.next().unwrap_or_default().to_string(),
        title: parts.next().unwrap_or_default().to_string(),
    })
}

fn list_pull_requests(repo_root: &Path) -> Result<Vec<PullRequestSummary>, String> {
    let output = command_stdout(
        repo_root,
        "gh",
        &[
            "pr",
            "list",
            "--limit",
            "50",
            "--json",
            "number,title,baseRefName,headRefName,headRefOid,url,state",
        ],
    )?;
    serde_json::from_str::<Vec<PullRequestSummary>>(&output)
        .map_err(|error| format!("Failed to parse gh pull request list: {error}"))
}

fn gh_pr_view(repo_root: &Path, selector: &str) -> Result<PullRequestSummary, String> {
    let output = command_stdout(
        repo_root,
        "gh",
        &[
            "pr",
            "view",
            selector,
            "--json",
            "number,title,baseRefName,headRefName,headRefOid,url,state",
        ],
    )?;
    serde_json::from_str::<PullRequestSummary>(&output)
        .map_err(|error| format!("Failed to parse gh pull request: {error}"))
}

fn fetch_pull_request_head(repo_root: &Path, remote: &str, number: u64) -> Result<String, String> {
    let local_ref = format!("refs/remotes/review-desk/pr-{number}");
    let source_ref = format!("pull/{number}/head:{local_ref}");
    git_stdout(repo_root, &["fetch", remote, &source_ref])?;
    Ok(local_ref)
}

fn best_base_ref(repo_root: &Path, remote: &str, base: &str) -> String {
    let remote_base = format!("{remote}/{base}");
    if git_ref_exists(repo_root, &remote_base) {
        return remote_base;
    }
    base.to_string()
}

fn git_ref_exists(repo_root: &Path, reference: &str) -> bool {
    git_stdout(repo_root, &["rev-parse", "--verify", "--quiet", reference]).is_ok()
}

fn single_commit_base(repo_root: &Path, commit: &str) -> String {
    let parent = format!("{commit}^");
    git_stdout(repo_root, &["rev-parse", "--verify", &parent])
        .map(|value| value.trim().to_string())
        .ok()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| EMPTY_TREE_SHA.to_string())
}

fn parse_pr_number(value: &str) -> Option<u64> {
    let trimmed = value.trim().trim_end_matches('/');
    if let Ok(number) = trimmed.parse::<u64>() {
        return Some(number);
    }
    trimmed
        .rsplit('/')
        .next()
        .and_then(|part| part.parse::<u64>().ok())
}

fn clean_ref(value: &str, label: &str) -> Result<String, String> {
    clean_optional(value).ok_or_else(|| format!("Missing {label}"))
}

fn clean_optional(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn ref_weight(git_ref: &GitRef) -> (usize, usize) {
    let mainish = matches!(
        git_ref.name.as_str(),
        "main" | "master" | "origin/main" | "origin/master" | "upstream/main" | "upstream/master"
    );
    let kind_weight = match git_ref.kind {
        GitRefKind::Local => 0,
        GitRefKind::Remote => 1,
    };

    (
        if git_ref.is_head {
            0
        } else if mainish {
            1
        } else {
            2
        },
        kind_weight,
    )
}

fn resolve_review_target(
    repo_root: &Path,
    request: &CreateReviewSessionRequest,
) -> Result<ResolvedTarget, String> {
    let target =
        request
            .target
            .clone()
            .unwrap_or_else(|| match (&request.base_ref, &request.head_ref) {
                (Some(base), Some(head)) if !base.trim().is_empty() && !head.trim().is_empty() => {
                    ReviewTargetRequest::Branch {
                        base_ref: base.clone(),
                        head_ref: head.clone(),
                    }
                }
                (Some(base), _) if !base.trim().is_empty() => ReviewTargetRequest::Branch {
                    base_ref: base.clone(),
                    head_ref: "WORKTREE".to_string(),
                },
                _ => ReviewTargetRequest::WorkingTree,
            });

    match target {
        ReviewTargetRequest::WorkingTree => Ok(ResolvedTarget {
            target: ReviewTarget::WorkingTree {
                label: "Working tree".to_string(),
            },
            diff_target: None,
            session_key: "working-tree".to_string(),
            base_ref: None,
            head_ref: None,
            include_untracked: true,
        }),
        ReviewTargetRequest::Branch { base_ref, head_ref } => {
            let base = clean_ref(&base_ref, "base ref")?;
            let head = clean_ref(&head_ref, "head ref")?;
            let is_worktree = head == "WORKTREE";
            let diff_target = if is_worktree {
                Some(base.clone())
            } else {
                Some(format!("{base}...{head}"))
            };
            Ok(ResolvedTarget {
                target: ReviewTarget::Branch {
                    base_ref: base.clone(),
                    head_ref: if is_worktree {
                        "working tree".to_string()
                    } else {
                        head.clone()
                    },
                    label: if is_worktree {
                        format!("{base} -> working tree")
                    } else {
                        format!("{base}...{head}")
                    },
                },
                diff_target,
                session_key: if is_worktree {
                    format!("branch:{base}->working-tree")
                } else {
                    format!("branch:{base}...{head}")
                },
                base_ref: Some(base),
                head_ref: if is_worktree { None } else { Some(head) },
                include_untracked: is_worktree,
            })
        }
        ReviewTargetRequest::Commit { commit } => {
            let commit = clean_ref(&commit, "commit")?;
            let base = single_commit_base(repo_root, &commit);
            Ok(ResolvedTarget {
                target: ReviewTarget::Commit {
                    commit: commit.clone(),
                    label: format!("{commit}^..{commit}"),
                },
                diff_target: Some(format!("{base}..{commit}")),
                session_key: format!("commit:{commit}"),
                base_ref: Some(base),
                head_ref: Some(commit),
                include_untracked: false,
            })
        }
        ReviewTargetRequest::CommitRange { from_ref, to_ref } => {
            let from = clean_ref(&from_ref, "from commit")?;
            let to = clean_ref(&to_ref, "to commit")?;
            Ok(ResolvedTarget {
                target: ReviewTarget::CommitRange {
                    from_ref: from.clone(),
                    to_ref: to.clone(),
                    label: format!("{from}..{to}"),
                },
                diff_target: Some(format!("{from}..{to}")),
                session_key: format!("commit-range:{from}..{to}"),
                base_ref: Some(from),
                head_ref: Some(to),
                include_untracked: false,
            })
        }
        ReviewTargetRequest::PullRequest {
            remote,
            number,
            url,
            base_ref,
            head_ref,
        } => resolve_pull_request_target(repo_root, remote, number, url, base_ref, head_ref),
    }
}

fn resolve_pull_request_target(
    repo_root: &Path,
    remote: Option<String>,
    number: Option<u64>,
    url: Option<String>,
    base_ref: Option<String>,
    head_ref: Option<String>,
) -> Result<ResolvedTarget, String> {
    let pr_number = number.or_else(|| url.as_deref().and_then(parse_pr_number));
    let remote_name = remote
        .and_then(|value| clean_optional(&value))
        .or_else(|| default_remote_name(repo_root))
        .unwrap_or_else(|| "origin".to_string());

    let metadata = match (&url, pr_number) {
        (Some(pr_url), _) if !pr_url.trim().is_empty() => gh_pr_view(repo_root, pr_url.trim()).ok(),
        (_, Some(number)) => gh_pr_view(repo_root, &number.to_string()).ok(),
        _ => None,
    };

    let base = clean_optional(base_ref.as_deref().unwrap_or_default())
        .or_else(|| metadata.as_ref().map(|pr| pr.base_ref_name.clone()))
        .ok_or_else(|| "Pull request target needs a base ref".to_string())?;
    let number = pr_number.or_else(|| metadata.as_ref().map(|pr| pr.number));
    let pr_url = url.or_else(|| metadata.as_ref().map(|pr| pr.url.clone()));

    let head = if let Some(number) = number {
        fetch_pull_request_head(repo_root, &remote_name, number).or_else(|_| {
            metadata
                .as_ref()
                .map(|pr| pr.head_ref_oid.clone())
                .ok_or_else(|| "Failed to resolve pull request head".to_string())
        })?
    } else {
        clean_optional(head_ref.as_deref().unwrap_or_default())
            .or_else(|| metadata.as_ref().map(|pr| pr.head_ref_oid.clone()))
            .ok_or_else(|| "Pull request target needs a head ref".to_string())?
    };

    let base_for_diff = best_base_ref(repo_root, &remote_name, &base);
    let diff_target = format!("{base_for_diff}...{head}");
    let label = number
        .map(|value| format!("PR #{value}: {base}...{head}"))
        .unwrap_or_else(|| format!("PR: {base}...{head}"));

    Ok(ResolvedTarget {
        target: ReviewTarget::PullRequest {
            remote: Some(remote_name.clone()),
            number,
            url: pr_url.clone(),
            base_ref: base_for_diff.clone(),
            head_ref: head.clone(),
            label,
        },
        diff_target: Some(diff_target),
        session_key: number
            .map(|value| format!("pull-request:{remote_name}#{value}"))
            .unwrap_or_else(|| format!("pull-request:{}...{}", base_for_diff, head)),
        base_ref: Some(base_for_diff),
        head_ref: Some(head),
        include_untracked: false,
    })
}

fn changed_paths(
    repo_root: &Path,
    diff_target: Option<&str>,
    include_untracked: bool,
) -> Result<Vec<ChangedPath>, String> {
    let mut paths = Vec::new();
    let mut diff_args = vec!["diff", "--name-only", "-z", "--find-renames"];
    if let Some(target) = diff_target {
        diff_args.push(target);
    } else {
        diff_args.push("HEAD");
    }
    diff_args.push("--");

    for path in split_nul(&git_stdout(repo_root, &diff_args)?) {
        if !path.trim().is_empty() {
            paths.push(ChangedPath {
                path,
                source: ChangeSource::Tracked,
            });
        }
    }

    if include_untracked {
        for path in split_nul(&git_stdout(
            repo_root,
            &["ls-files", "--others", "--exclude-standard", "-z"],
        )?) {
            if !path.trim().is_empty() {
                paths.push(ChangedPath {
                    path,
                    source: ChangeSource::Untracked,
                });
            }
        }
    }

    Ok(paths)
}

fn tracked_file_patches(
    repo_root: &Path,
    diff_target: Option<&str>,
    paths: &[String],
) -> Result<Vec<ReviewFile>, String> {
    if paths.is_empty() {
        return Ok(Vec::new());
    }

    let mut args = vec![
        "diff".to_string(),
        "--no-color".to_string(),
        "--find-renames".to_string(),
        "--diff-algorithm=histogram".to_string(),
        "--unified=10".to_string(),
        "--inter-hunk-context=3".to_string(),
    ];
    if let Some(target) = diff_target {
        args.push(target.to_string());
    } else {
        args.push("HEAD".to_string());
    }
    args.push("--".to_string());
    args.extend(paths.iter().cloned());

    let patch = git_stdout_strings(repo_root, &args)?;
    Ok(parse_patch_set(&patch, paths))
}

fn untracked_file_patch(repo_root: &Path, path: &str) -> Result<ReviewFile, String> {
    let full_path = repo_root.join(path);
    let bytes = fs::read(&full_path)
        .map_err(|error| format!("Failed to read untracked file {path}: {error}"))?;

    if bytes.contains(&0) {
        return Ok(empty_file(path));
    }

    let content = String::from_utf8_lossy(&bytes);
    let mut lines = Vec::new();
    let mut additions = 0;

    for (index, line) in content.lines().enumerate() {
        additions += 1;
        lines.push(DiffLine {
            kind: DiffLineKind::Addition,
            old_line: None,
            new_line: Some(index + 1),
            diff_position: Some(index + 1),
            content: line.to_string(),
        });
    }

    if content.ends_with('\n') && content.is_empty() {
        lines.push(DiffLine {
            kind: DiffLineKind::Addition,
            old_line: None,
            new_line: Some(1),
            diff_position: Some(1),
            content: String::new(),
        });
        additions = 1;
    }

    let hunk = DiffHunk {
        header: format!("@@ -0,0 +1,{additions} @@"),
        old_start: 0,
        old_lines: 0,
        new_start: 1,
        new_lines: additions,
        lines,
    };

    Ok(ReviewFile {
        id: file_id(path),
        path: path.to_string(),
        patch_hash: content_hash(&content),
        old_path: None,
        change_kind: ChangeKind::Added,
        additions,
        deletions: 0,
        viewed_status: ViewedStatus::Unseen,
        order_group: None,
        review_reason: None,
        agent_notes: Vec::new(),
        hunks: vec![hunk],
    })
}

fn empty_file(path: &str) -> ReviewFile {
    ReviewFile {
        id: file_id(path),
        path: path.to_string(),
        patch_hash: content_hash(path),
        old_path: None,
        change_kind: ChangeKind::Modified,
        additions: 0,
        deletions: 0,
        viewed_status: ViewedStatus::Unseen,
        order_group: None,
        review_reason: None,
        agent_notes: Vec::new(),
        hunks: Vec::new(),
    }
}

fn parse_patch_set(patch: &str, fallback_paths: &[String]) -> Vec<ReviewFile> {
    let mut chunks = Vec::new();
    let mut current = String::new();

    for line in patch.lines() {
        if line.starts_with("diff --git ") && !current.is_empty() {
            chunks.push(current);
            current = String::new();
        }
        current.push_str(line);
        current.push('\n');
    }

    if !current.is_empty() {
        chunks.push(current);
    }

    chunks
        .into_iter()
        .enumerate()
        .map(|(index, chunk)| {
            let fallback = fallback_paths.get(index).map(String::as_str).unwrap_or("");
            parse_patch(&chunk, fallback)
        })
        .collect()
}

fn parse_patch(patch: &str, fallback_path: &str) -> ReviewFile {
    let mut path = fallback_path.to_string();
    let mut old_path = None;
    let mut change_kind = ChangeKind::Modified;
    let mut hunks = Vec::new();
    let mut current_hunk: Option<DiffHunk> = None;
    let mut old_line = 0;
    let mut new_line = 0;
    let mut diff_position = 0;
    let mut additions = 0;
    let mut deletions = 0;

    for line in patch.lines() {
        if let Some(next_path) = line.strip_prefix("+++ ") {
            if next_path == "/dev/null" {
                change_kind = ChangeKind::Deleted;
            } else {
                path = strip_diff_path(next_path).to_string();
            }
            continue;
        }

        if let Some(previous_path) = line.strip_prefix("--- ") {
            if previous_path != "/dev/null" {
                old_path = Some(strip_diff_path(previous_path).to_string());
            } else {
                change_kind = ChangeKind::Added;
            }
            continue;
        }

        if let Some(previous_path) = line.strip_prefix("rename from ") {
            old_path = Some(previous_path.to_string());
            change_kind = ChangeKind::Renamed;
            continue;
        }

        if let Some(next_path) = line.strip_prefix("rename to ") {
            path = next_path.to_string();
            change_kind = ChangeKind::Renamed;
            continue;
        }

        if line.starts_with("@@ ") {
            if let Some(hunk) = current_hunk.take() {
                hunks.push(hunk);
            }
            let (old_start, old_lines, new_start, new_lines) = parse_hunk_header(line);
            old_line = old_start;
            new_line = new_start;
            diff_position = 0;
            current_hunk = Some(DiffHunk {
                header: line.to_string(),
                old_start,
                old_lines,
                new_start,
                new_lines,
                lines: Vec::new(),
            });
            continue;
        }

        let Some(hunk) = current_hunk.as_mut() else {
            continue;
        };

        if line.starts_with('\\') {
            continue;
        }

        let Some(marker) = line.chars().next() else {
            continue;
        };

        let content = line.get(1..).unwrap_or_default().to_string();
        diff_position += 1;

        match marker {
            '+' => {
                additions += 1;
                hunk.lines.push(DiffLine {
                    kind: DiffLineKind::Addition,
                    old_line: None,
                    new_line: Some(new_line),
                    diff_position: Some(diff_position),
                    content,
                });
                new_line += 1;
            }
            '-' => {
                deletions += 1;
                hunk.lines.push(DiffLine {
                    kind: DiffLineKind::Deletion,
                    old_line: Some(old_line),
                    new_line: None,
                    diff_position: Some(diff_position),
                    content,
                });
                old_line += 1;
            }
            ' ' => {
                hunk.lines.push(DiffLine {
                    kind: DiffLineKind::Context,
                    old_line: Some(old_line),
                    new_line: Some(new_line),
                    diff_position: Some(diff_position),
                    content,
                });
                old_line += 1;
                new_line += 1;
            }
            _ => {}
        }
    }

    if let Some(hunk) = current_hunk {
        hunks.push(hunk);
    }

    if old_path.as_deref() == Some(&path) {
        old_path = None;
    }

    ReviewFile {
        id: file_id(&path),
        path: path.clone(),
        patch_hash: content_hash(patch),
        old_path,
        change_kind,
        additions,
        deletions,
        viewed_status: ViewedStatus::Unseen,
        order_group: None,
        review_reason: None,
        agent_notes: Vec::new(),
        hunks,
    }
}

fn generated_reason(path: &str) -> Option<String> {
    let lower = path.to_ascii_lowercase();
    let generated_markers = [
        "node_modules/",
        "/gen/",
        "/generated/",
        "src-tauri/target/",
        "dist/",
        "build/",
        ".lock",
        ".review-desk/",
    ];
    if lower == "pnpm-lock.yaml" || lower == "package-lock.json" || lower == "yarn.lock" {
        return Some("Lockfile excluded from default review".to_string());
    }
    if lower.starts_with("src-tauri/icons/") {
        return Some("Generated app icon asset".to_string());
    }
    generated_markers
        .iter()
        .find(|marker| lower.contains(**marker))
        .map(|marker| format!("Generated path marker: {marker}"))
}

fn parse_hunk_header(header: &str) -> (usize, usize, usize, usize) {
    let mut parts = header.split_whitespace();
    let _marker = parts.next();
    let old_range = parts.next().unwrap_or("-0,0");
    let new_range = parts.next().unwrap_or("+0,0");
    let (old_start, old_lines) = parse_range(old_range, '-');
    let (new_start, new_lines) = parse_range(new_range, '+');
    (old_start, old_lines, new_start, new_lines)
}

fn parse_range(range: &str, prefix: char) -> (usize, usize) {
    let stripped = range.trim_start_matches(prefix);
    let mut parts = stripped.split(',');
    let start = parts
        .next()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    let lines = parts
        .next()
        .and_then(|value| value.parse().ok())
        .unwrap_or(1);
    (start, lines)
}

fn strip_diff_path(path: &str) -> &str {
    path.strip_prefix("a/")
        .or_else(|| path.strip_prefix("b/"))
        .unwrap_or(path)
}

fn file_id(path: &str) -> String {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("file-{:x}", hasher.finish())
}

fn session_id(repo_root: &Path, session_key: &str) -> String {
    let mut hasher = DefaultHasher::new();
    repo_root.display().to_string().hash(&mut hasher);
    session_key.hash(&mut hasher);
    format!("session-{:x}", hasher.finish())
}

fn snapshot_hash(
    session_key: &str,
    files: &[ReviewFile],
    excluded_files: &[ExcludedFile],
) -> String {
    let mut hasher = DefaultHasher::new();
    session_key.hash(&mut hasher);
    for file in files {
        file.path.hash(&mut hasher);
        file.patch_hash.hash(&mut hasher);
    }
    for file in excluded_files {
        file.path.hash(&mut hasher);
        file.reason.hash(&mut hasher);
    }
    format!("snapshot-{:x}", hasher.finish())
}

fn manifest_session_id(
    repo_root: &str,
    diff_target: &str,
    manifest_path: &Path,
    _files: &[ReviewFile],
) -> String {
    let mut hasher = DefaultHasher::new();
    repo_root.hash(&mut hasher);
    diff_target.hash(&mut hasher);
    manifest_path.display().to_string().hash(&mut hasher);
    format!("agent-session-{:x}", hasher.finish())
}

fn content_hash(value: &str) -> String {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    format!("patch-{:x}", hasher.finish())
}

fn split_nul(output: &str) -> Vec<String> {
    output
        .split('\0')
        .filter(|part| !part.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn git_stdout(repo_root: &Path, args: &[&str]) -> Result<String, String> {
    let repo_arg = repo_root.to_string_lossy().to_string();
    command_stdout_with_args("git", &["-C", &repo_arg], args)
}

fn git_stdout_strings(repo_root: &Path, args: &[String]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_root)
        .args(args)
        .output()
        .map_err(|error| format!("Failed to run git {:?}: {error}", args))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git {:?} failed: {}", args, stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn command_stdout(repo_root: &Path, command: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(command)
        .current_dir(repo_root)
        .args(args)
        .output()
        .map_err(|error| format!("Failed to run {command} {:?}: {error}", args))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{command} {:?} failed: {}", args, stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn command_stdout_with_args(
    command: &str,
    prefix_args: &[&str],
    args: &[&str],
) -> Result<String, String> {
    let output = Command::new(command)
        .args(prefix_args)
        .args(args)
        .output()
        .map_err(|error| format!("Failed to run {command} {:?}: {error}", args))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{command} {:?} failed: {}", args, stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEMP_REPO_COUNTER: AtomicU64 = AtomicU64::new(0);

    #[test]
    fn parses_hunk_header_with_counts() {
        assert_eq!(
            parse_hunk_header("@@ -12,7 +14,9 @@ fn test"),
            (12, 7, 14, 9)
        );
    }

    #[test]
    fn excludes_generated_paths() {
        assert!(generated_reason("ui/staging/client/gen/schema.ts").is_some());
        assert!(generated_reason("src/components/review/DiffCanvas.tsx").is_none());
    }

    #[test]
    fn parses_git_refs_for_picker() {
        let git_ref = parse_ref_line(
            "feature/review-desk\tabc1234\torigin/feature/review-desk",
            GitRefKind::Local,
            "feature/review-desk",
        )
        .unwrap();

        assert_eq!(git_ref.name, "feature/review-desk");
        assert_eq!(git_ref.kind, GitRefKind::Local);
        assert_eq!(git_ref.short_sha, "abc1234");
        assert!(git_ref.is_head);
        assert_eq!(
            git_ref.upstream.as_deref(),
            Some("origin/feature/review-desk")
        );
        assert!(parse_ref_line("origin/HEAD\tabc1234\t", GitRefKind::Remote, "main").is_none());
    }

    #[test]
    fn parses_pull_request_numbers_from_url_or_number() {
        assert_eq!(parse_pr_number("42"), Some(42));
        assert_eq!(
            parse_pr_number("https://github.com/example/repo/pull/128"),
            Some(128)
        );
        assert_eq!(
            parse_pr_number("https://github.com/example/repo/pull/128/"),
            Some(128)
        );
        assert_eq!(parse_pr_number("not-a-pr"), None);
    }

    #[test]
    fn deserializes_camel_case_review_targets() {
        let branch = serde_json::from_value::<ReviewTargetRequest>(serde_json::json!({
            "kind": "branch",
            "baseRef": "main",
            "headRef": "feature/review"
        }))
        .unwrap();
        match branch {
            ReviewTargetRequest::Branch { base_ref, head_ref } => {
                assert_eq!(base_ref, "main");
                assert_eq!(head_ref, "feature/review");
            }
            _ => panic!("expected branch target"),
        }

        let range = serde_json::from_value::<ReviewTargetRequest>(serde_json::json!({
            "kind": "commitRange",
            "fromRef": "0a5d4f3",
            "toRef": "08e9c7f"
        }))
        .unwrap();
        match range {
            ReviewTargetRequest::CommitRange { from_ref, to_ref } => {
                assert_eq!(from_ref, "0a5d4f3");
                assert_eq!(to_ref, "08e9c7f");
            }
            _ => panic!("expected commit range target"),
        }
    }

    #[test]
    fn imports_agent_manifest_order() {
        let repo = temp_repo();
        fs::create_dir_all(repo.join("src")).unwrap();
        fs::create_dir_all(repo.join(".review-desk/sessions")).unwrap();
        fs::write(repo.join("README.md"), "initial\n").unwrap();
        run_git(&repo, &["init"]);
        run_git(&repo, &["config", "user.email", "review-desk@example.test"]);
        run_git(&repo, &["config", "user.name", "Review Desk Test"]);
        run_git(&repo, &["add", "README.md"]);
        run_git(&repo, &["commit", "-m", "initial"]);

        fs::write(repo.join("README.md"), "initial\nchanged\n").unwrap();
        fs::write(repo.join("src/lib.rs"), "pub fn run() {}\n").unwrap();
        fs::write(repo.join("pnpm-lock.yaml"), "lockfileVersion: '9.0'\n").unwrap();

        let manifest_path = repo
            .join(".review-desk")
            .join("sessions")
            .join("review.review-session.json");
        let manifest = serde_json::json!({
            "version": 1,
            "repoRoot": repo.display().to_string(),
            "title": "Review test change",
            "createdBy": "codex",
            "fileOrder": [
                {
                    "path": "src/lib.rs",
                    "group": "Entry points",
                    "reason": "Start with the runtime entry."
                },
                {
                    "path": "src/missing.rs",
                    "group": "Empty group",
                    "reason": "This should not render as an empty group."
                }
            ],
            "agentNotes": [
                {
                    "path": "src/lib.rs",
                    "source": "codex",
                    "note": "Check the new public function."
                }
            ]
        });
        fs::write(
            &manifest_path,
            serde_json::to_string_pretty(&manifest).unwrap(),
        )
        .unwrap();

        let session = import_review_session(ImportReviewSessionRequest {
            manifest_path: manifest_path.display().to_string(),
        })
        .unwrap();

        assert_eq!(session.files[0].path, "src/lib.rs");
        assert_eq!(
            session.files[0].order_group.as_deref(),
            Some("Entry points")
        );
        assert_eq!(
            session.files[0].review_reason.as_deref(),
            Some("Start with the runtime entry.")
        );
        assert_eq!(session.files[0].agent_notes.len(), 1);
        assert_eq!(session.order.groups[0].title, "Entry points");
        assert!(session
            .order
            .groups
            .iter()
            .all(|group| group.title != "Empty group"));
        assert!(session
            .excluded_files
            .iter()
            .any(|file| file.path == "pnpm-lock.yaml"));
        assert!(session
            .excluded_files
            .iter()
            .any(|file| file.path == ".review-desk/sessions/review.review-session.json"));

        fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn creates_session_from_dirty_worktree() {
        let repo = temp_repo();
        fs::create_dir_all(repo.join("src-tauri/src")).unwrap();
        fs::write(repo.join("README.md"), "initial\n").unwrap();
        run_git(&repo, &["init"]);
        run_git(&repo, &["config", "user.email", "review-desk@example.test"]);
        run_git(&repo, &["config", "user.name", "Review Desk Test"]);
        run_git(&repo, &["add", "README.md"]);
        run_git(&repo, &["commit", "-m", "initial"]);

        fs::write(repo.join("README.md"), "initial\nchanged\n").unwrap();
        fs::write(repo.join("src-tauri/src/lib.rs"), "pub fn run() {}\n").unwrap();
        fs::write(repo.join("pnpm-lock.yaml"), "lockfileVersion: '9.0'\n").unwrap();

        let session = create_review_session(CreateReviewSessionRequest {
            repo_path: repo.display().to_string(),
            base_ref: None,
            head_ref: None,
            target: None,
        })
        .unwrap();

        let paths = session
            .files
            .iter()
            .map(|file| file.path.as_str())
            .collect::<Vec<_>>();

        assert!(paths.contains(&"README.md"));
        assert!(paths.contains(&"src-tauri/src/lib.rs"));
        assert!(session
            .excluded_files
            .iter()
            .any(|file| file.path == "pnpm-lock.yaml"));

        fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn keeps_session_id_stable_when_worktree_changes_but_snapshot_changes() {
        let repo = temp_repo();
        fs::create_dir_all(&repo).unwrap();
        fs::write(repo.join("README.md"), "initial\n").unwrap();
        run_git(&repo, &["init"]);
        run_git(&repo, &["config", "user.email", "review-desk@example.test"]);
        run_git(&repo, &["config", "user.name", "Review Desk Test"]);
        run_git(&repo, &["add", "README.md"]);
        run_git(&repo, &["commit", "-m", "initial"]);

        fs::write(repo.join("README.md"), "initial\nchanged\n").unwrap();
        let first = create_review_session(CreateReviewSessionRequest {
            repo_path: repo.display().to_string(),
            base_ref: None,
            head_ref: None,
            target: Some(ReviewTargetRequest::WorkingTree),
        })
        .unwrap();

        fs::write(repo.join("src.rs"), "pub fn added() {}\n").unwrap();
        let second = create_review_session(CreateReviewSessionRequest {
            repo_path: repo.display().to_string(),
            base_ref: None,
            head_ref: None,
            target: Some(ReviewTargetRequest::WorkingTree),
        })
        .unwrap();

        assert_eq!(first.id, second.id);
        assert_ne!(first.snapshot_hash, second.snapshot_hash);
        assert!(second.files.iter().any(|file| file.path == "src.rs"));

        fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn creates_compact_histogram_diff_context() {
        let repo = temp_repo();
        fs::create_dir_all(&repo).unwrap();
        let content = (1..=80)
            .map(|line| format!("line {line}"))
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(repo.join("README.md"), format!("{content}\n")).unwrap();
        run_git(&repo, &["init"]);
        run_git(&repo, &["config", "user.email", "review-desk@example.test"]);
        run_git(&repo, &["config", "user.name", "Review Desk Test"]);
        run_git(&repo, &["add", "README.md"]);
        run_git(&repo, &["commit", "-m", "initial"]);

        let changed = content.replace("line 40", "line forty");
        fs::write(repo.join("README.md"), format!("{changed}\n")).unwrap();
        let session = create_review_session(CreateReviewSessionRequest {
            repo_path: repo.display().to_string(),
            base_ref: None,
            head_ref: None,
            target: Some(ReviewTargetRequest::WorkingTree),
        })
        .unwrap();

        let readme = session
            .files
            .iter()
            .find(|file| file.path == "README.md")
            .unwrap();
        assert_eq!(readme.hunks.len(), 1);
        assert!(readme.hunks[0].lines.len() <= 22);

        fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn creates_single_commit_target() {
        let repo = temp_repo();
        fs::create_dir_all(&repo).unwrap();
        fs::write(repo.join("README.md"), "initial\n").unwrap();
        run_git(&repo, &["init"]);
        run_git(&repo, &["config", "user.email", "review-desk@example.test"]);
        run_git(&repo, &["config", "user.name", "Review Desk Test"]);
        run_git(&repo, &["add", "README.md"]);
        run_git(&repo, &["commit", "-m", "initial"]);
        fs::write(repo.join("README.md"), "initial\nchanged\n").unwrap();
        run_git(&repo, &["add", "README.md"]);
        run_git(&repo, &["commit", "-m", "change readme"]);

        let session = create_review_session(CreateReviewSessionRequest {
            repo_path: repo.display().to_string(),
            base_ref: None,
            head_ref: None,
            target: Some(ReviewTargetRequest::Commit {
                commit: "HEAD".to_string(),
            }),
        })
        .unwrap();

        assert!(session.patch_artifact.diff_target.ends_with("..HEAD"));
        assert_eq!(session.files[0].path, "README.md");

        fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn creates_root_single_commit_target() {
        let repo = temp_repo();
        fs::create_dir_all(&repo).unwrap();
        fs::write(repo.join("README.md"), "initial\n").unwrap();
        run_git(&repo, &["init"]);
        run_git(&repo, &["config", "user.email", "review-desk@example.test"]);
        run_git(&repo, &["config", "user.name", "Review Desk Test"]);
        run_git(&repo, &["add", "README.md"]);
        run_git(&repo, &["commit", "-m", "initial"]);

        let root_commit = git_stdout(&repo, &["rev-parse", "HEAD"]).unwrap();
        let session = create_review_session(CreateReviewSessionRequest {
            repo_path: repo.display().to_string(),
            base_ref: None,
            head_ref: None,
            target: Some(ReviewTargetRequest::Commit {
                commit: root_commit.trim().to_string(),
            }),
        })
        .unwrap();

        assert!(session
            .patch_artifact
            .diff_target
            .starts_with(EMPTY_TREE_SHA));
        assert_eq!(session.files[0].path, "README.md");

        fs::remove_dir_all(repo).unwrap();
    }

    fn temp_repo() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let counter = TEMP_REPO_COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "review-desk-test-{stamp}-{}-{counter}",
            std::process::id()
        ))
    }

    fn run_git(repo: &Path, args: &[&str]) {
        let output = Command::new("git")
            .arg("-C")
            .arg(repo)
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }
}
