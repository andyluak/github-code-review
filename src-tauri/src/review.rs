use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{
    collections::{hash_map::DefaultHasher, HashSet, VecDeque},
    env, fs,
    hash::{Hash, Hasher},
    path::{Component, Path, PathBuf},
    process::Command,
};

use crate::github::gh::run_gh_command;

const EMPTY_TREE_SHA: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const REFERENCE_SOURCE_MAX_BYTES: usize = 512 * 1024;
const REFERENCE_SOURCE_MAX_FILES: usize = 320;

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTextFileRequest {
    path: String,
    contents: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenReviewFileRequest {
    repo_path: String,
    file_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadReviewAssetPreviewRequest {
    repo_path: String,
    file_path: String,
    old_path: Option<String>,
    change_kind: ChangeKind,
    diff_target: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadReviewReferenceSourcesRequest {
    repo_path: String,
    files: Vec<ReviewReferenceSourceRequestFile>,
    #[serde(default)]
    max_file_bytes: Option<usize>,
    #[serde(default)]
    include_imports: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReviewReferenceSourceRequestFile {
    path: String,
    change_kind: ChangeKind,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewReferenceSources {
    files: Vec<ReviewReferenceSourceFile>,
    warnings: Vec<ReviewReferenceSourceWarning>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewReferenceSourceFile {
    path: String,
    content: String,
    byte_size: usize,
    is_review_file: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewReferenceSourceWarning {
    path: Option<String>,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewAssetPreview {
    file_path: String,
    mime_type: String,
    old: Option<ReviewAssetSide>,
    new: Option<ReviewAssetSide>,
    message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewAssetSide {
    label: String,
    path: String,
    data_url: String,
    mime_type: String,
    byte_size: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadReviewWorkspaceStateRequest {
    repo_path: String,
    session_id: String,
    #[serde(default)]
    legacy_session_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReviewWorkspaceStateRequest {
    repo_path: String,
    session_id: String,
    state: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReviewRecentReposRequest {
    repos: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLastRepoPathRequest {
    repo_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReviewHistoryRequest {
    history: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSessionIdRequest {
    session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReviewSessionSnapshotRequest {
    session_id: String,
    session: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLastReviewSessionRequest {
    session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveActiveReviewFileRequest {
    session_id: String,
    file_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PruneReviewSessionSnapshotsRequest {
    active_session_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonArrayPersistenceResponse {
    exists: bool,
    value: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonPersistenceResponse {
    exists: bool,
    value: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StringPersistenceResponse {
    exists: bool,
    value: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadReviewDiagramRequest {
    repo_path: String,
    session_id: String,
    #[serde(default)]
    scope: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReviewDiagramRequest {
    repo_path: String,
    diagram: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSession {
    id: String,
    legacy_session_ids: Vec<String>,
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

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
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
    head_repository: Option<PullRequestHeadRepository>,
    head_repository_owner: Option<PullRequestHeadRepositoryOwner>,
    is_cross_repository: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PullRequestHeadRepository {
    name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PullRequestHeadRepositoryOwner {
    login: String,
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
        head_sha: Option<String>,
        head_ref_name: Option<String>,
        base_ref_name: Option<String>,
        head_repo_owner: Option<String>,
        head_repo_name: Option<String>,
        is_cross_repository: Option<bool>,
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
    target: Option<ReviewTargetRequest>,
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
pub async fn create_review_session(
    request: CreateReviewSessionRequest,
) -> Result<ReviewSession, String> {
    crate::blocking::run("create_review_session", move || {
        create_review_session_inner(request)
    })
    .await
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
    let excluded_files = Vec::new();
    let mut included_tracked_paths = Vec::new();
    let mut included_untracked_paths = Vec::new();

    for changed_path in &changed {
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
        let parsed = match changed_path.source {
            ChangeSource::Tracked => tracked_by_path.get(&changed_path.path).cloned(),
            ChangeSource::Untracked => untracked_by_path.get(&changed_path.path).cloned(),
        };

        if let Some(parsed) = parsed {
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
        legacy_session_ids: Vec::new(),
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
pub async fn import_review_session(
    request: ImportReviewSessionRequest,
) -> Result<ReviewSession, String> {
    crate::blocking::run("import_review_session", move || {
        import_review_session_from_path(PathBuf::from(&request.manifest_path))
    })
    .await
}

#[tauri::command]
pub fn save_text_file(request: SaveTextFileRequest) -> Result<(), String> {
    let path = PathBuf::from(&request.path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create export directory {}: {error}",
                parent.display()
            )
        })?;
    }
    fs::write(&path, request.contents)
        .map_err(|error| format!("Failed to write export {}: {error}", path.display()))
}

#[tauri::command]
pub fn open_review_file(request: OpenReviewFileRequest) -> Result<(), String> {
    let repo_root = repo_root(&request.repo_path)?;
    let relative_path = safe_relative_review_path(&request.file_path)?;
    let requested_path = repo_root.join(relative_path);
    let canonical_repo = repo_root.canonicalize().map_err(|error| {
        format!(
            "Failed to resolve repository path {}: {error}",
            repo_root.display()
        )
    })?;
    let canonical_file = requested_path.canonicalize().map_err(|error| {
        format!(
            "Cannot open {} from the working tree: {error}",
            requested_path.display()
        )
    })?;

    if !canonical_file.starts_with(&canonical_repo) {
        return Err(format!(
            "Refusing to open path outside repository: {}",
            request.file_path
        ));
    }

    open_file_in_editor(&canonical_file).map_err(|error| {
        format!(
            "Failed to open {} in editor: {error}",
            canonical_file.display()
        )
    })
}

#[tauri::command]
pub async fn load_review_asset_preview(
    request: LoadReviewAssetPreviewRequest,
) -> Result<ReviewAssetPreview, String> {
    crate::blocking::run("load_review_asset_preview", move || {
        load_review_asset_preview_inner(request)
    })
    .await
}

#[tauri::command]
pub async fn load_review_reference_sources(
    request: LoadReviewReferenceSourcesRequest,
) -> Result<ReviewReferenceSources, String> {
    crate::blocking::run("load_review_reference_sources", move || {
        load_review_reference_sources_inner(request)
    })
    .await
}

fn load_review_asset_preview_inner(
    request: LoadReviewAssetPreviewRequest,
) -> Result<ReviewAssetPreview, String> {
    let repo_root = repo_root(&request.repo_path)?;
    let relative_path = safe_relative_review_path(&request.file_path)?;
    let file_path = relative_path.to_string_lossy().replace('\\', "/");
    let old_path = request
        .old_path
        .as_deref()
        .map(safe_relative_review_path)
        .transpose()?
        .map(|path| path.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|| file_path.clone());
    let mime_type = image_mime_type(&file_path)
        .ok_or_else(|| format!("No image preview is available for {}", request.file_path))?
        .to_string();
    let (old_source, new_source) = asset_sources(&repo_root, request.diff_target.trim())?;

    let old = if request.change_kind == ChangeKind::Added {
        None
    } else {
        load_asset_side(&repo_root, &old_path, old_source, "before")?
    };
    let new = if request.change_kind == ChangeKind::Deleted {
        None
    } else {
        load_asset_side(&repo_root, &file_path, new_source, "after")?
    };
    let message = if old.is_none() && new.is_none() {
        Some("Image data could not be resolved from this checkout.".to_string())
    } else {
        None
    };

    Ok(ReviewAssetPreview {
        file_path,
        mime_type,
        old,
        new,
        message,
    })
}

fn load_review_reference_sources_inner(
    request: LoadReviewReferenceSourcesRequest,
) -> Result<ReviewReferenceSources, String> {
    let repo_root = repo_root(&request.repo_path)?;
    let canonical_repo = repo_root.canonicalize().map_err(|error| {
        format!(
            "Failed to resolve repository path {}: {error}",
            repo_root.display()
        )
    })?;
    let max_file_bytes = request.max_file_bytes.unwrap_or(REFERENCE_SOURCE_MAX_BYTES);
    let include_imports = request.include_imports.unwrap_or(true);
    let mut warnings = Vec::new();
    let mut files = Vec::new();
    let mut seen = HashSet::new();
    let mut review_paths = HashSet::new();
    let mut queue = VecDeque::new();

    for file in request.files {
        if file.change_kind == ChangeKind::Deleted || !is_reference_ts_like_path(&file.path) {
            continue;
        }
        let path = normalize_review_source_path(&file.path)?;
        review_paths.insert(path.clone());
        queue.push_back(path);
    }

    while let Some(path) = queue.pop_front() {
        if !seen.insert(path.clone()) {
            continue;
        }
        if files.len() >= REFERENCE_SOURCE_MAX_FILES {
            warnings.push(ReviewReferenceSourceWarning {
                path: None,
                message: format!(
                    "Reference index capped at {REFERENCE_SOURCE_MAX_FILES} source files."
                ),
            });
            break;
        }

        match read_reference_source_file(&repo_root, &canonical_repo, &path, max_file_bytes) {
            Ok(Some((content, byte_size))) => {
                let is_review_file = review_paths.contains(&path);
                if include_imports {
                    for specifier in reference_import_specifiers(&content) {
                        if !specifier.starts_with('.') {
                            continue;
                        }
                        if let Some(import_path) =
                            resolve_reference_import(&canonical_repo, &path, &specifier)
                        {
                            if is_reference_ts_like_path(&import_path)
                                && !seen.contains(&import_path)
                            {
                                queue.push_back(import_path);
                            }
                        }
                    }
                }
                files.push(ReviewReferenceSourceFile {
                    path,
                    content,
                    byte_size,
                    is_review_file,
                });
            }
            Ok(None) => {
                if review_paths.contains(&path) {
                    warnings.push(ReviewReferenceSourceWarning {
                        path: Some(path),
                        message: "Reference source is missing from the working tree.".to_string(),
                    });
                }
            }
            Err(message) => warnings.push(ReviewReferenceSourceWarning {
                path: Some(path),
                message,
            }),
        }
    }

    Ok(ReviewReferenceSources { files, warnings })
}

fn open_file_in_editor(path: &Path) -> Result<(), String> {
    let mut errors = Vec::new();

    for editor in editor_open_targets() {
        match editor.open(path) {
            Ok(()) => return Ok(()),
            Err(error) => errors.push(error),
        }
    }

    tauri_plugin_opener::open_path(path, None::<&str>).map_err(|error| {
        let editor_errors = if errors.is_empty() {
            String::new()
        } else {
            format!(" Editor attempts failed: {}", errors.join("; "))
        };
        format!("system default open failed: {error}.{editor_errors}")
    })
}

#[derive(Debug)]
enum EditorOpenTarget {
    Command(PathBuf),
    #[cfg(target_os = "macos")]
    MacApp(&'static str),
}

impl EditorOpenTarget {
    fn open(&self, path: &Path) -> Result<(), String> {
        match self {
            Self::Command(command) => open_with_command(command, path),
            #[cfg(target_os = "macos")]
            Self::MacApp(application) => open_with_macos_application(application, path),
        }
    }
}

fn editor_open_targets() -> Vec<EditorOpenTarget> {
    let mut targets = Vec::new();

    if let Some(command) = non_empty_env_path("REVIEW_DESK_EDITOR") {
        targets.push(EditorOpenTarget::Command(command));
    }

    #[cfg(target_os = "macos")]
    targets.push(EditorOpenTarget::MacApp("Cursor"));

    targets.extend(cursor_command_candidates().map(EditorOpenTarget::Command));

    for variable in ["VISUAL", "EDITOR"] {
        if let Some(command) = non_empty_env_path(variable) {
            targets.push(EditorOpenTarget::Command(command));
        }
    }

    targets
}

fn cursor_command_candidates() -> impl Iterator<Item = PathBuf> {
    [
        "/usr/local/bin/cursor",
        "/opt/homebrew/bin/cursor",
        "cursor",
    ]
    .into_iter()
    .map(PathBuf::from)
}

fn non_empty_env_path(variable: &str) -> Option<PathBuf> {
    let value = env::var_os(variable)?;
    if value.is_empty() {
        return None;
    }
    Some(PathBuf::from(value))
}

fn open_with_command(command: &Path, path: &Path) -> Result<(), String> {
    let output = Command::new(command)
        .arg(path)
        .output()
        .map_err(|error| format!("{} failed to start: {error}", command.display()))?;

    if output.status.success() {
        return Ok(());
    }

    Err(format!(
        "{} exited with {}: {}",
        command.display(),
        output.status,
        command_stderr(&output.stderr)
    ))
}

#[cfg(target_os = "macos")]
fn open_with_macos_application(application: &str, path: &Path) -> Result<(), String> {
    let output = Command::new("open")
        .arg("-a")
        .arg(application)
        .arg(path)
        .output()
        .map_err(|error| format!("open -a {application} failed to start: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    Err(format!(
        "open -a {application} exited with {}: {}",
        output.status,
        command_stderr(&output.stderr)
    ))
}

fn command_stderr(stderr: &[u8]) -> String {
    let message = String::from_utf8_lossy(stderr).trim().to_string();
    if message.is_empty() {
        "no stderr".to_string()
    } else {
        message
    }
}

#[tauri::command]
pub async fn load_review_workspace_state(
    request: LoadReviewWorkspaceStateRequest,
) -> Result<Option<serde_json::Value>, String> {
    crate::blocking::run("load_review_workspace_state", move || {
        load_review_workspace_state_inner(request)
    })
    .await
}

fn load_review_workspace_state_inner(
    request: LoadReviewWorkspaceStateRequest,
) -> Result<Option<serde_json::Value>, String> {
    let repo_root = repo_root(&request.repo_path)?;
    let current_path = review_workspace_state_path(&repo_root, &request.session_id)?;
    let mut session_ids = vec![request.session_id.clone()];
    session_ids.extend(request.legacy_session_ids);
    session_ids.dedup();

    for session_id in session_ids {
        let state_path = review_workspace_state_path(&repo_root, &session_id)?;
        if !state_path.exists() {
            continue;
        }

        let state_content = fs::read_to_string(&state_path).map_err(|error| {
            format!(
                "Failed to read workspace state {}: {error}",
                state_path.display()
            )
        })?;
        let state = serde_json::from_str::<serde_json::Value>(&state_content).map_err(|error| {
            format!(
                "Failed to parse workspace state {}: {error}",
                state_path.display()
            )
        })?;

        if state_path != current_path && !current_path.exists() {
            write_json_file(&current_path, &state)?;
        }

        return Ok(Some(state));
    }

    Ok(None)
}

#[tauri::command]
pub async fn save_review_workspace_state(
    request: SaveReviewWorkspaceStateRequest,
) -> Result<(), String> {
    crate::blocking::run("save_review_workspace_state", move || {
        save_review_workspace_state_inner(request)
    })
    .await
}

fn save_review_workspace_state_inner(
    request: SaveReviewWorkspaceStateRequest,
) -> Result<(), String> {
    let repo_root = repo_root(&request.repo_path)?;
    let state_path = review_workspace_state_path(&repo_root, &request.session_id)?;
    write_json_file(&state_path, &request.state)
}

#[tauri::command]
pub async fn load_review_recent_repos() -> Result<JsonArrayPersistenceResponse, String> {
    crate::blocking::run("load_review_recent_repos", move || {
        load_json_array_persistence(review_recent_repos_path()?)
    })
    .await
}

#[tauri::command]
pub async fn save_review_recent_repos(request: SaveReviewRecentReposRequest) -> Result<(), String> {
    crate::blocking::run("save_review_recent_repos", move || {
        write_json_file(&review_recent_repos_path()?, &request.repos)
    })
    .await
}

#[tauri::command]
pub async fn clear_review_recent_repos() -> Result<(), String> {
    crate::blocking::run("clear_review_recent_repos", move || {
        delete_file_if_exists(&review_recent_repos_path()?)?;
        delete_file_if_exists(&review_last_repo_path()?)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn load_last_repo_path() -> Result<StringPersistenceResponse, String> {
    crate::blocking::run("load_last_repo_path", move || {
        load_string_persistence(review_last_repo_path()?)
    })
    .await
}

#[tauri::command]
pub async fn save_last_repo_path(request: SaveLastRepoPathRequest) -> Result<(), String> {
    crate::blocking::run("save_last_repo_path", move || {
        write_json_file(&review_last_repo_path()?, &request.repo_path)
    })
    .await
}

#[tauri::command]
pub async fn load_review_history() -> Result<JsonArrayPersistenceResponse, String> {
    crate::blocking::run("load_review_history", move || {
        load_json_array_persistence(review_history_path()?)
    })
    .await
}

#[tauri::command]
pub async fn save_review_history(request: SaveReviewHistoryRequest) -> Result<(), String> {
    crate::blocking::run("save_review_history", move || {
        write_json_file(&review_history_path()?, &request.history)
    })
    .await
}

#[tauri::command]
pub async fn clear_review_history() -> Result<(), String> {
    crate::blocking::run("clear_review_history", move || {
        delete_file_if_exists(&review_history_path()?)?;
        delete_file_if_exists(&review_last_session_path()?)?;
        delete_dir_if_exists(&review_session_snapshots_dir()?)?;
        delete_dir_if_exists(&review_active_files_dir()?)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn load_review_session_snapshot(
    request: ReviewSessionIdRequest,
) -> Result<JsonPersistenceResponse, String> {
    crate::blocking::run("load_review_session_snapshot", move || {
        load_json_persistence(review_session_snapshot_path(&request.session_id)?)
    })
    .await
}

#[tauri::command]
pub async fn save_review_session_snapshot(
    request: SaveReviewSessionSnapshotRequest,
) -> Result<(), String> {
    crate::blocking::run("save_review_session_snapshot", move || {
        write_json_file(
            &review_session_snapshot_path(&request.session_id)?,
            &request.session,
        )
    })
    .await
}

#[tauri::command]
pub async fn delete_review_session_snapshot(request: ReviewSessionIdRequest) -> Result<(), String> {
    crate::blocking::run("delete_review_session_snapshot", move || {
        delete_review_session_snapshot_inner(&request.session_id)
    })
    .await
}

#[tauri::command]
pub async fn load_last_review_session_snapshot() -> Result<JsonPersistenceResponse, String> {
    crate::blocking::run("load_last_review_session_snapshot", move || {
        load_last_review_session_snapshot_inner()
    })
    .await
}

#[tauri::command]
pub async fn save_last_review_session(request: SaveLastReviewSessionRequest) -> Result<(), String> {
    crate::blocking::run("save_last_review_session", move || {
        write_json_file(&review_last_session_path()?, &request.session_id)
    })
    .await
}

#[tauri::command]
pub async fn load_active_review_file(
    request: ReviewSessionIdRequest,
) -> Result<StringPersistenceResponse, String> {
    crate::blocking::run("load_active_review_file", move || {
        load_string_persistence(review_active_file_path(&request.session_id)?)
    })
    .await
}

#[tauri::command]
pub async fn save_active_review_file(request: SaveActiveReviewFileRequest) -> Result<(), String> {
    crate::blocking::run("save_active_review_file", move || {
        let path = review_active_file_path(&request.session_id)?;
        if let Some(file_id) = request.file_id.filter(|value| !value.trim().is_empty()) {
            write_json_file(&path, &file_id)
        } else {
            delete_file_if_exists(&path)
        }
    })
    .await
}

#[tauri::command]
pub async fn prune_review_session_snapshots(
    request: PruneReviewSessionSnapshotsRequest,
) -> Result<(), String> {
    crate::blocking::run("prune_review_session_snapshots", move || {
        prune_review_session_snapshots_inner(request)
    })
    .await
}

#[tauri::command]
pub async fn load_review_diagram(
    request: LoadReviewDiagramRequest,
) -> Result<Option<serde_json::Value>, String> {
    crate::blocking::run("load_review_diagram", move || {
        load_review_diagram_inner(request)
    })
    .await
}

fn load_review_diagram_inner(
    request: LoadReviewDiagramRequest,
) -> Result<Option<serde_json::Value>, String> {
    let repo_root = repo_root(&request.repo_path)?;
    let diagram_path = if let Some(scope) = request.scope.as_deref() {
        let scope = validate_diagram_scope(scope)?;
        let path = review_diagram_path(&repo_root, &request.session_id, scope)?;
        if !path.exists() {
            return Ok(None);
        }
        path
    } else {
        let Some(path) = latest_review_diagram_path(&repo_root, &request.session_id)? else {
            return Ok(None);
        };
        path
    };

    let content = fs::read_to_string(&diagram_path).map_err(|error| {
        format!(
            "Failed to read review diagram {}: {error}",
            diagram_path.display()
        )
    })?;
    serde_json::from_str::<serde_json::Value>(&content)
        .map(Some)
        .map_err(|error| {
            format!(
                "Failed to parse review diagram {}: {error}",
                diagram_path.display()
            )
        })
}

#[tauri::command]
pub async fn save_review_diagram(
    request: SaveReviewDiagramRequest,
) -> Result<serde_json::Value, String> {
    crate::blocking::run("save_review_diagram", move || {
        save_review_diagram_inner(request)
    })
    .await
}

fn save_review_diagram_inner(
    request: SaveReviewDiagramRequest,
) -> Result<serde_json::Value, String> {
    let repo_root = repo_root(&request.repo_path)?;
    let session_id = request
        .diagram
        .get("sessionId")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Review diagram is missing sessionId".to_string())?;
    let scope = request
        .diagram
        .get("scope")
        .and_then(|value| value.as_str())
        .unwrap_or("session");
    let scope = validate_diagram_scope(scope)?;
    let diagram_path = review_diagram_path(&repo_root, session_id, scope)?;
    write_json_file(&diagram_path, &request.diagram)?;
    Ok(request.diagram)
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

    let manifest_identity = content_hash(&manifest_content);
    let mut session = create_review_session_inner(CreateReviewSessionRequest {
        repo_path: manifest.repo_root.clone(),
        base_ref: manifest.base_ref.clone(),
        head_ref: manifest.head_ref.clone(),
        target: manifest.target.clone(),
    })?;
    apply_manifest_order(&mut session, manifest, &manifest_path, &manifest_identity);
    Ok(session)
}

#[tauri::command]
pub async fn get_active_review_session(
    request: ActiveReviewSessionRequest,
) -> Result<Option<ActiveReviewSession>, String> {
    crate::blocking::run("get_active_review_session", move || {
        get_active_review_session_inner(request)
    })
    .await
}

fn get_active_review_session_inner(
    request: ActiveReviewSessionRequest,
) -> Result<Option<ActiveReviewSession>, String> {
    let repo_root = repo_root(&request.repo_path)?;
    let Some((_, pointer)) = active_review_session_pointer(&repo_root)? else {
        return Ok(None);
    };
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
pub async fn import_active_review_session(
    request: ActiveReviewSessionRequest,
) -> Result<Option<ReviewSession>, String> {
    crate::blocking::run("import_active_review_session", move || {
        import_active_review_session_inner(request)
    })
    .await
}

fn import_active_review_session_inner(
    request: ActiveReviewSessionRequest,
) -> Result<Option<ReviewSession>, String> {
    let repo_root = repo_root(&request.repo_path)?;
    let Some((_, pointer)) = active_review_session_pointer(&repo_root)? else {
        return Ok(None);
    };
    let manifest_path = resolve_manifest_path(&repo_root, &pointer.manifest_path);
    if !manifest_path.exists() {
        return Ok(None);
    }

    import_review_session_from_path(manifest_path).map(Some)
}

#[tauri::command]
pub async fn get_global_active_review_session() -> Result<Option<ActiveReviewSession>, String> {
    crate::blocking::run("get_global_active_review_session", move || {
        get_global_active_review_session_inner()
    })
    .await
}

fn get_global_active_review_session_inner() -> Result<Option<ActiveReviewSession>, String> {
    let Some((_, pointer)) = global_active_review_session_pointer()? else {
        return Ok(None);
    };
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
pub async fn import_global_active_review_session() -> Result<Option<ReviewSession>, String> {
    crate::blocking::run("import_global_active_review_session", move || {
        import_global_active_review_session_inner()
    })
    .await
}

fn import_global_active_review_session_inner() -> Result<Option<ReviewSession>, String> {
    let Some((_, pointer)) = global_active_review_session_pointer()? else {
        return Ok(None);
    };
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

fn active_review_session_pointer(
    repo_root: &Path,
) -> Result<Option<(PathBuf, ActiveReviewSessionPointer)>, String> {
    for pointer_path in active_review_session_paths(repo_root) {
        if let Some(pointer) = read_active_pointer(&pointer_path, "active review session")? {
            return Ok(Some((pointer_path, pointer)));
        }
    }
    Ok(None)
}

fn global_active_review_session_pointer(
) -> Result<Option<(PathBuf, ActiveReviewSessionPointer)>, String> {
    for pointer_path in global_active_review_session_paths() {
        if let Some(pointer) = read_active_pointer(&pointer_path, "global active review session")? {
            return Ok(Some((pointer_path, pointer)));
        }
    }
    Ok(None)
}

fn read_active_pointer(
    pointer_path: &Path,
    label: &str,
) -> Result<Option<ActiveReviewSessionPointer>, String> {
    if !pointer_path.exists() {
        return Ok(None);
    }

    let pointer_content = fs::read_to_string(pointer_path)
        .map_err(|error| format!("Failed to read {label} {}: {error}", pointer_path.display()))?;
    serde_json::from_str(&pointer_content)
        .map(Some)
        .map_err(|error| {
            format!(
                "Failed to parse {label} {}: {error}",
                pointer_path.display()
            )
        })
}

fn active_review_session_paths(repo_root: &Path) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(path) = app_active_review_session_path(repo_root) {
        paths.push(path);
    }
    paths.push(legacy_active_review_session_path(repo_root));
    paths
}

fn global_active_review_session_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(path) = app_global_active_review_session_path() {
        paths.push(path);
    }
    if let Some(path) = legacy_global_active_review_session_path() {
        paths.push(path);
    }
    paths
}

fn app_active_review_session_path(repo_root: &Path) -> Option<PathBuf> {
    review_desk_data_dir().map(|data_dir| {
        data_dir
            .join("repos")
            .join(repo_storage_key(repo_root))
            .join("active-session.json")
    })
}

fn app_global_active_review_session_path() -> Option<PathBuf> {
    review_desk_data_dir().map(|data_dir| data_dir.join("active-session.json"))
}

fn review_ui_state_dir() -> Result<PathBuf, String> {
    let Some(data_dir) = review_desk_data_dir() else {
        return Err("Review Desk app data directory is unavailable".to_string());
    };
    Ok(data_dir.join("ui-state"))
}

fn review_recent_repos_path() -> Result<PathBuf, String> {
    Ok(review_ui_state_dir()?.join("recent-repos.json"))
}

fn review_last_repo_path() -> Result<PathBuf, String> {
    Ok(review_ui_state_dir()?.join("last-repo.json"))
}

fn review_history_path() -> Result<PathBuf, String> {
    Ok(review_ui_state_dir()?.join("review-history.json"))
}

fn review_last_session_path() -> Result<PathBuf, String> {
    Ok(review_ui_state_dir()?.join("last-review-session.json"))
}

fn review_session_snapshots_dir() -> Result<PathBuf, String> {
    Ok(review_ui_state_dir()?.join("review-session-snapshots"))
}

fn review_active_files_dir() -> Result<PathBuf, String> {
    Ok(review_ui_state_dir()?.join("active-review-files"))
}

fn review_session_snapshot_path(session_id: &str) -> Result<PathBuf, String> {
    Ok(review_session_snapshots_dir()?.join(review_ui_state_file_name(session_id)?))
}

fn review_active_file_path(session_id: &str) -> Result<PathBuf, String> {
    Ok(review_active_files_dir()?.join(review_ui_state_file_name(session_id)?))
}

fn review_workspace_state_path(repo_root: &Path, session_id: &str) -> Result<PathBuf, String> {
    let session_file_name = workspace_state_file_name(session_id)?;
    let Some(data_dir) = review_desk_data_dir() else {
        return Err("Review Desk app data directory is unavailable".to_string());
    };

    Ok(data_dir
        .join("repos")
        .join(repo_storage_key(repo_root))
        .join("workspace-state")
        .join(session_file_name))
}

fn review_diagram_path(repo_root: &Path, session_id: &str, scope: &str) -> Result<PathBuf, String> {
    let diagram_file_name = review_diagram_file_name(session_id, scope)?;
    Ok(review_diagrams_dir(repo_root)?.join(diagram_file_name))
}

fn review_diagrams_dir(repo_root: &Path) -> Result<PathBuf, String> {
    let Some(data_dir) = review_desk_data_dir() else {
        return Err("Review Desk app data directory is unavailable".to_string());
    };
    Ok(data_dir
        .join("repos")
        .join(repo_storage_key(repo_root))
        .join("diagrams"))
}

fn latest_review_diagram_path(
    repo_root: &Path,
    session_id: &str,
) -> Result<Option<PathBuf>, String> {
    let session_prefix = format!("{}-", workspace_state_session_id(session_id)?);
    let diagrams_dir = review_diagrams_dir(repo_root)?;
    if !diagrams_dir.exists() {
        return Ok(None);
    }

    let mut candidates = Vec::new();
    for entry in fs::read_dir(&diagrams_dir).map_err(|error| {
        format!(
            "Failed to read diagrams directory {}: {error}",
            diagrams_dir.display()
        )
    })? {
        let entry = entry.map_err(|error| {
            format!(
                "Failed to read diagrams directory entry {}: {error}",
                diagrams_dir.display()
            )
        })?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !name.starts_with(&session_prefix) || !name.ends_with(".review-diagram.json") {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok();
        candidates.push((modified, path));
    }

    candidates.sort_by(|left, right| right.0.cmp(&left.0));
    Ok(candidates.into_iter().map(|(_, path)| path).next())
}

fn review_diagram_file_name(session_id: &str, scope: &str) -> Result<String, String> {
    let session_id = workspace_state_session_id(session_id)?;
    let scope = validate_diagram_scope(scope)?;
    Ok(format!("{session_id}-{scope}.review-diagram.json"))
}

fn workspace_state_file_name(session_id: &str) -> Result<String, String> {
    Ok(format!("{}.json", workspace_state_session_id(session_id)?))
}

fn workspace_state_session_id(session_id: &str) -> Result<String, String> {
    review_ui_state_id(session_id)
        .map_err(|_| format!("Invalid workspace state session id: {session_id}"))
}

fn review_ui_state_file_name(id: &str) -> Result<String, String> {
    Ok(format!("{}.json", review_ui_state_id(id)?))
}

fn review_ui_state_id(id: &str) -> Result<String, String> {
    let trimmed = id.trim();
    if trimmed.is_empty()
        || trimmed.len() > 160
        || !trimmed.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
    {
        return Err("Invalid review state id".to_string());
    }

    Ok(trimmed.to_string())
}

fn validate_diagram_scope(scope: &str) -> Result<&str, String> {
    match scope {
        "session" | "neighbors" | "deep" => Ok(scope),
        _ => Err(format!("Invalid review diagram scope: {scope}")),
    }
}

fn legacy_active_review_session_path(repo_root: &Path) -> PathBuf {
    repo_root.join(".review-desk").join("active-session.json")
}

fn legacy_global_active_review_session_path() -> Option<PathBuf> {
    env::var_os("HOME").map(|home| PathBuf::from(home).join(".review-desk/active-session.json"))
}

fn review_desk_data_dir() -> Option<PathBuf> {
    crate::app_data::review_desk_data_dir()
}

fn repo_storage_key(repo_root: &Path) -> String {
    crate::app_data::repo_storage_key(repo_root)
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
    manifest_identity: &str,
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
    let stable_session_id = manifest_session_id(
        &session.repo.root,
        session.patch_artifact.diff_target.as_str(),
        manifest_identity,
    );
    session.legacy_session_ids = legacy_manifest_session_ids(
        &session.repo.root,
        session.patch_artifact.diff_target.as_str(),
        manifest_path,
        &stable_session_id,
    );
    session.id = stable_session_id;
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
pub async fn list_review_refs(request: ListReviewRefsRequest) -> Result<RepoRefs, String> {
    crate::blocking::run("list_review_refs", move || list_review_refs_inner(request)).await
}

fn list_review_refs_inner(request: ListReviewRefsRequest) -> Result<RepoRefs, String> {
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
    Ok(RepoRefs {
        requested_path: request.repo_path,
        root: repo_root.display().to_string(),
        current_branch,
        default_branch: default_branch(&repo_root),
        head_sha,
        remotes: list_remotes(&repo_root)?,
        refs,
        commits: list_recent_commits(&repo_root)?,
        pull_requests: Vec::new(),
        pull_request_error: None,
    })
}

fn repo_root(path: &str) -> Result<PathBuf, String> {
    let output = git_stdout(Path::new(path), &["rev-parse", "--show-toplevel"])?;
    Ok(PathBuf::from(output.trim()))
}

pub fn resolve_repo_root(path: &str) -> Result<PathBuf, String> {
    repo_root(path)
}

fn safe_relative_review_path(path: &str) -> Result<PathBuf, String> {
    let mut relative_path = PathBuf::new();

    for component in Path::new(path).components() {
        match component {
            Component::Normal(part) => relative_path.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(format!("Invalid review file path: {path}"));
            }
        }
    }

    if relative_path.as_os_str().is_empty() {
        return Err("Invalid empty review file path".to_string());
    }

    Ok(relative_path)
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

fn remote_name_matching_pr_url(repo_root: &Path, pr_url: &str) -> Option<String> {
    let pr_repo = parse_owner_repo_from_pr_url(pr_url)?;
    let remotes = list_remotes(repo_root).ok()?;
    remotes
        .iter()
        .find(|remote| {
            crate::github::remote::parse_github_remote(&remote.url)
                .map(|gh| {
                    gh.owner.eq_ignore_ascii_case(&pr_repo.0)
                        && gh.repo.eq_ignore_ascii_case(&pr_repo.1)
                })
                .unwrap_or(false)
        })
        .map(|remote| remote.name.clone())
}

fn parse_owner_repo_from_pr_url(url: &str) -> Option<(String, String)> {
    // Accepts https://github.com/OWNER/REPO/pull/N(/...)
    let trimmed = url.trim();
    let stripped = trimmed
        .strip_prefix("https://github.com/")
        .or_else(|| trimmed.strip_prefix("http://github.com/"))?;
    let mut parts = stripped.split('/');
    let owner = parts.next()?.to_string();
    let repo = parts.next()?.trim_end_matches(".git").to_string();
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some((owner, repo))
}

fn default_remote_name(repo_root: &Path) -> Option<String> {
    let remotes = list_remotes(repo_root).ok()?;
    if remotes.is_empty() {
        return None;
    }
    // Prefer the canonical upstream before origin so PR-ref fetches and base resolution
    // land on the repo that hosts pull/<n>/head in fork-heavy checkouts.
    for preferred in ["upstream", "origin"] {
        if let Some(remote) = remotes.iter().find(|r| r.name == preferred) {
            return Some(remote.name.clone());
        }
    }
    remotes.into_iter().next().map(|remote| remote.name)
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

fn gh_pr_view(repo_root: &Path, selector: &str) -> Result<PullRequestSummary, String> {
    let output = run_gh_command(
        Some(repo_root),
        &[
            "pr",
            "view",
            selector,
            "--json",
            "number,title,baseRefName,headRefName,headRefOid,url,state,headRepository,headRepositoryOwner,isCrossRepository",
        ],
        None,
    )?;
    serde_json::from_str::<PullRequestSummary>(&output)
        .map_err(|error| format!("Failed to parse gh pull request: {error}"))
}

fn fetch_pull_request_head(repo_root: &Path, remote: &str, number: u64) -> Result<String, String> {
    let local_ref = pull_request_local_ref(number);
    let source_ref = format!("pull/{number}/head:{local_ref}");
    git_stdout(repo_root, &["fetch", remote, &source_ref])?;
    Ok(local_ref)
}

fn reusable_pull_request_head_ref(
    repo_root: &Path,
    number: u64,
    expected_sha: Option<&str>,
) -> Option<String> {
    let local_ref = pull_request_local_ref(number);
    let actual_sha = rev_parse_ref(repo_root, &local_ref)?;
    if expected_sha
        .map(|sha| sha.eq_ignore_ascii_case(&actual_sha))
        .unwrap_or(true)
    {
        Some(local_ref)
    } else {
        None
    }
}

fn pull_request_local_ref(number: u64) -> String {
    format!("refs/remotes/review-desk/pr-{number}")
}

fn best_base_ref(repo_root: &Path, remote: &str, base: &str) -> String {
    // Prefer fully-qualified refs to dodge the ambiguity between
    // `refs/heads/<remote>/<base>` and `refs/remotes/<remote>/<base>` that can break
    // symmetric-difference expressions in `git diff a...b`.
    let qualified_remote = format!("refs/remotes/{remote}/{base}");
    if git_ref_exists(repo_root, &qualified_remote) {
        return qualified_remote;
    }
    let qualified_local = format!("refs/heads/{base}");
    if git_ref_exists(repo_root, &qualified_local) {
        return qualified_local;
    }
    let remote_base = format!("{remote}/{base}");
    if git_ref_exists(repo_root, &remote_base) {
        return remote_base;
    }
    base.to_string()
}

fn git_ref_exists(repo_root: &Path, reference: &str) -> bool {
    git_stdout(repo_root, &["rev-parse", "--verify", "--quiet", reference]).is_ok()
}

fn rev_parse_ref(repo_root: &Path, reference: &str) -> Option<String> {
    git_stdout(repo_root, &["rev-parse", "--verify", reference])
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
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

    let metadata_selector = match (&url, pr_number) {
        (Some(pr_url), _) if !pr_url.trim().is_empty() => Some(pr_url.trim().to_string()),
        (_, Some(number)) => Some(number.to_string()),
        _ => None,
    };
    let (metadata, metadata_error) = match metadata_selector.as_deref() {
        Some(selector) => match gh_pr_view(repo_root, selector) {
            Ok(pr) => (Some(pr), None),
            Err(error) => (
                None,
                Some(format!(
                    "Failed to load GitHub pull request metadata for {selector}: {error}"
                )),
            ),
        },
        None => (None, None),
    };

    let pr_url_resolved = url
        .clone()
        .or_else(|| metadata.as_ref().map(|pr| pr.url.clone()));
    // Prefer the remote whose URL matches the PR's BASE repo (parsed from the PR URL).
    // GitHub serves `pull/<n>/head` from the base repo, so fetching from any other remote
    // (e.g. a contributor fork) will not produce the SHA we need.
    let remote_name = remote
        .and_then(|value| clean_optional(&value))
        .or_else(|| {
            pr_url_resolved
                .as_deref()
                .and_then(|pr_url| remote_name_matching_pr_url(repo_root, pr_url))
        })
        .or_else(|| default_remote_name(repo_root))
        .unwrap_or_else(|| "origin".to_string());

    let base = clean_optional(base_ref.as_deref().unwrap_or_default())
        .or_else(|| metadata.as_ref().map(|pr| pr.base_ref_name.clone()))
        .ok_or_else(|| {
            if let Some(error) = metadata_error.as_deref() {
                format!("Pull request target needs a base ref. {error}")
            } else {
                "Pull request target needs a base ref".to_string()
            }
        })?;
    let number = pr_number.or_else(|| metadata.as_ref().map(|pr| pr.number));
    let pr_url = pr_url_resolved;
    let metadata_head_sha = metadata
        .as_ref()
        .map(|pr| pr.head_ref_oid.clone())
        .filter(|sha| !sha.trim().is_empty());

    let head = if let Some(number) = number {
        if let Some(local_ref) =
            reusable_pull_request_head_ref(repo_root, number, metadata_head_sha.as_deref())
        {
            local_ref
        } else if let Some(local_sha) = metadata_head_sha
            .as_deref()
            .filter(|sha| git_ref_exists(repo_root, sha))
        {
            local_sha.to_string()
        } else {
            match fetch_pull_request_head(repo_root, &remote_name, number) {
                Ok(local_ref) => local_ref,
                Err(fetch_error) => {
                    // Falling back to the raw GitHub SHA only helps if the object is locally
                    // resolvable. Otherwise downstream `git diff` will explode on an unknown rev.
                    let candidate = metadata_head_sha
                        .clone()
                        .filter(|sha| git_ref_exists(repo_root, sha));
                    candidate.ok_or_else(|| {
                        format!(
                        "Failed to fetch pull request #{number} from `{remote_name}`: {fetch_error}"
                    )
                    })?
                }
            }
        }
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

    let head_sha = metadata_head_sha.or_else(|| {
        git_stdout(repo_root, &["rev-parse", &head])
            .ok()
            .map(|sha| sha.trim().to_string())
            .filter(|sha| !sha.is_empty())
    });
    if head_sha.is_none() {
        if let Some(error) = metadata_error {
            return Err(format!("Failed to resolve pull request head SHA. {error}"));
        }
    }
    let head_ref_name = metadata.as_ref().map(|pr| pr.head_ref_name.clone());
    let base_ref_name_meta = metadata.as_ref().map(|pr| pr.base_ref_name.clone());
    let head_repo_owner = metadata
        .as_ref()
        .and_then(|pr| pr.head_repository_owner.as_ref())
        .map(|owner| owner.login.clone());
    let head_repo_name = metadata
        .as_ref()
        .and_then(|pr| pr.head_repository.as_ref())
        .map(|repo| repo.name.clone());
    let is_cross_repository = metadata.as_ref().and_then(|pr| pr.is_cross_repository);

    Ok(ResolvedTarget {
        target: ReviewTarget::PullRequest {
            remote: Some(remote_name.clone()),
            number,
            url: pr_url.clone(),
            base_ref: base_for_diff.clone(),
            head_ref: head.clone(),
            label,
            head_sha,
            head_ref_name,
            base_ref_name: base_ref_name_meta,
            head_repo_owner,
            head_repo_name,
            is_cross_repository,
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

// `slug` and `fnv1a64` moved to crate::app_data.

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

fn manifest_session_id(repo_root: &str, diff_target: &str, manifest_identity: &str) -> String {
    let mut hasher = DefaultHasher::new();
    repo_root.hash(&mut hasher);
    diff_target.hash(&mut hasher);
    manifest_identity.hash(&mut hasher);
    format!("agent-session-{:x}", hasher.finish())
}

fn legacy_manifest_session_ids(
    repo_root: &str,
    diff_target: &str,
    manifest_path: &Path,
    current_session_id: &str,
) -> Vec<String> {
    let mut session_ids = Vec::new();
    let path_id = path_manifest_session_id(repo_root, diff_target, manifest_path);
    if path_id != current_session_id {
        session_ids.push(path_id);
    }

    if let Some(file_name) = manifest_path.file_name() {
        let legacy_manifest_path = PathBuf::from(repo_root)
            .join(".review-desk")
            .join("sessions")
            .join(file_name);
        let legacy_path_id =
            path_manifest_session_id(repo_root, diff_target, &legacy_manifest_path);
        if legacy_path_id != current_session_id && !session_ids.contains(&legacy_path_id) {
            session_ids.push(legacy_path_id);
        }
    }

    session_ids
}

fn path_manifest_session_id(repo_root: &str, diff_target: &str, manifest_path: &Path) -> String {
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

#[derive(Debug, Clone)]
enum AssetSource {
    Git(String),
    Worktree,
}

fn asset_sources(
    repo_root: &Path,
    diff_target: &str,
) -> Result<(Option<AssetSource>, Option<AssetSource>), String> {
    let target = diff_target.trim();
    if target.is_empty() || !target.contains("..") {
        let old = if target.is_empty() { "HEAD" } else { target };
        return Ok((
            Some(AssetSource::Git(old.to_string())),
            Some(AssetSource::Worktree),
        ));
    }

    if let Some((base, head)) = target.split_once("...") {
        let merge_base = git_stdout(repo_root, &["merge-base", base, head])?
            .trim()
            .to_string();
        return Ok((
            Some(AssetSource::Git(merge_base)),
            Some(AssetSource::Git(head.to_string())),
        ));
    }

    if let Some((base, head)) = target.split_once("..") {
        return Ok((
            Some(AssetSource::Git(base.to_string())),
            Some(AssetSource::Git(head.to_string())),
        ));
    }

    Ok((
        Some(AssetSource::Git(target.to_string())),
        Some(AssetSource::Worktree),
    ))
}

fn load_asset_side(
    repo_root: &Path,
    path: &str,
    source: Option<AssetSource>,
    label: &str,
) -> Result<Option<ReviewAssetSide>, String> {
    let Some(source) = source else {
        return Ok(None);
    };
    let Some(mime_type) = image_mime_type(path) else {
        return Ok(None);
    };
    let bytes = match source {
        AssetSource::Worktree => read_worktree_asset(repo_root, path)?,
        AssetSource::Git(rev) => read_git_asset(repo_root, &rev, path)?,
    };
    let Some(bytes) = bytes else {
        return Ok(None);
    };
    let byte_size = bytes.len();
    Ok(Some(ReviewAssetSide {
        label: label.to_string(),
        path: path.to_string(),
        data_url: format!("data:{mime_type};base64,{}", base64_encode(&bytes)),
        mime_type: mime_type.to_string(),
        byte_size,
    }))
}

fn read_worktree_asset(repo_root: &Path, path: &str) -> Result<Option<Vec<u8>>, String> {
    let relative_path = safe_relative_review_path(path)?;
    let requested_path = repo_root.join(relative_path);
    if !requested_path.exists() {
        return Ok(None);
    }
    let canonical_repo = repo_root.canonicalize().map_err(|error| {
        format!(
            "Failed to resolve repository path {}: {error}",
            repo_root.display()
        )
    })?;
    let canonical_file = requested_path.canonicalize().map_err(|error| {
        format!(
            "Failed to resolve image path {}: {error}",
            requested_path.display()
        )
    })?;
    if !canonical_file.starts_with(&canonical_repo) {
        return Err(format!(
            "Refusing to preview path outside repository: {path}"
        ));
    }
    fs::read(&canonical_file)
        .map(Some)
        .map_err(|error| format!("Failed to read image {}: {error}", canonical_file.display()))
}

fn read_git_asset(repo_root: &Path, rev: &str, path: &str) -> Result<Option<Vec<u8>>, String> {
    if rev.trim().is_empty() {
        return Ok(None);
    }
    safe_relative_review_path(path)?;
    let spec = format!("{}:{}", rev.trim(), path);
    match git_stdout_bytes(repo_root, &["show", &spec]) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(_) => Ok(None),
    }
}

fn normalize_review_source_path(path: &str) -> Result<String, String> {
    Ok(safe_relative_review_path(path)?
        .to_string_lossy()
        .replace('\\', "/"))
}

fn read_reference_source_file(
    repo_root: &Path,
    canonical_repo: &Path,
    path: &str,
    max_file_bytes: usize,
) -> Result<Option<(String, usize)>, String> {
    let relative_path = safe_relative_review_path(path)?;
    let requested_path = repo_root.join(relative_path);
    if !requested_path.exists() {
        return Ok(None);
    }

    let canonical_file = requested_path.canonicalize().map_err(|error| {
        format!(
            "Failed to resolve reference source {}: {error}",
            requested_path.display()
        )
    })?;
    if !canonical_file.starts_with(canonical_repo) {
        return Err(format!("Refusing to index path outside repository: {path}"));
    }

    let metadata = fs::metadata(&canonical_file).map_err(|error| {
        format!(
            "Failed to inspect reference source {}: {error}",
            canonical_file.display()
        )
    })?;
    let byte_size = metadata.len() as usize;
    if byte_size > max_file_bytes {
        return Err(format!(
            "Skipped large reference source ({byte_size} bytes, cap {max_file_bytes})."
        ));
    }

    let bytes = fs::read(&canonical_file).map_err(|error| {
        format!(
            "Failed to read reference source {}: {error}",
            canonical_file.display()
        )
    })?;
    if bytes.contains(&0) {
        return Err("Skipped binary reference source.".to_string());
    }

    Ok(Some((
        String::from_utf8_lossy(&bytes).to_string(),
        byte_size,
    )))
}

fn reference_import_specifiers(source: &str) -> Vec<String> {
    let mut specifiers = Vec::new();
    let bytes = source.as_bytes();
    let mut index = 0;

    while index < bytes.len() {
        let quote = bytes[index];
        if quote != b'\'' && quote != b'"' {
            index += 1;
            continue;
        }

        let prefix_start = index.saturating_sub(40);
        let prefix = String::from_utf8_lossy(&bytes[prefix_start..index]);
        let prefix = prefix.trim_end();
        let looks_like_import =
            prefix.ends_with("from") || prefix.ends_with("import(") || prefix.ends_with("require(");

        index += 1;
        let value_start = index;
        while index < bytes.len() && bytes[index] != quote {
            if bytes[index] == b'\\' {
                index = index.saturating_add(2);
            } else {
                index += 1;
            }
        }
        if looks_like_import && index <= bytes.len() {
            let value = &source[value_start..index];
            if !value.is_empty() {
                specifiers.push(value.to_string());
            }
        }
        index += 1;
    }

    specifiers.sort();
    specifiers.dedup();
    specifiers
}

fn resolve_reference_import(
    canonical_repo: &Path,
    source_path: &str,
    specifier: &str,
) -> Option<String> {
    let source_relative = safe_relative_review_path(source_path).ok()?;
    let source_dir = source_relative.parent().unwrap_or_else(|| Path::new(""));
    let base = canonical_repo.join(source_dir).join(specifier);
    let mut candidates = vec![base.clone()];

    if base.extension().is_none() {
        for extension in ["ts", "tsx", "js", "jsx", "mts", "cts", "mjs", "cjs"] {
            candidates.push(PathBuf::from(format!("{}.{}", base.display(), extension)));
        }
    }

    for extension in ["ts", "tsx", "js", "jsx"] {
        candidates.push(base.join(format!("index.{extension}")));
    }

    for candidate in candidates {
        if !candidate.is_file() {
            continue;
        }
        let canonical = candidate.canonicalize().ok()?;
        if !canonical.starts_with(canonical_repo) {
            continue;
        }
        let relative = canonical.strip_prefix(canonical_repo).ok()?;
        return Some(relative.to_string_lossy().replace('\\', "/"));
    }

    None
}

fn is_reference_ts_like_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".ts")
        || lower.ends_with(".tsx")
        || lower.ends_with(".js")
        || lower.ends_with(".jsx")
        || lower.ends_with(".mts")
        || lower.ends_with(".cts")
        || lower.ends_with(".mjs")
        || lower.ends_with(".cjs")
}

fn image_mime_type(path: &str) -> Option<&'static str> {
    let extension = Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut encoded = String::with_capacity(bytes.len().div_ceil(3) * 4);
    let mut index = 0;
    while index < bytes.len() {
        let b0 = bytes[index];
        let b1 = bytes.get(index + 1).copied();
        let b2 = bytes.get(index + 2).copied();
        encoded.push(TABLE[(b0 >> 2) as usize] as char);
        encoded.push(TABLE[(((b0 & 0b0000_0011) << 4) | (b1.unwrap_or(0) >> 4)) as usize] as char);
        if let Some(b1) = b1 {
            encoded
                .push(TABLE[(((b1 & 0b0000_1111) << 2) | (b2.unwrap_or(0) >> 6)) as usize] as char);
        } else {
            encoded.push('=');
        }
        if let Some(b2) = b2 {
            encoded.push(TABLE[(b2 & 0b0011_1111) as usize] as char);
        } else {
            encoded.push('=');
        }
        index += 3;
    }
    encoded
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

fn git_stdout_bytes(repo_root: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
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

    Ok(output.stdout)
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

fn load_json_array_persistence(path: PathBuf) -> Result<JsonArrayPersistenceResponse, String> {
    let (exists, value) = read_optional_json::<Vec<serde_json::Value>>(&path)?;
    Ok(JsonArrayPersistenceResponse {
        exists,
        value: value.unwrap_or_default(),
    })
}

fn load_json_persistence(path: PathBuf) -> Result<JsonPersistenceResponse, String> {
    let (exists, value) = read_optional_json::<serde_json::Value>(&path)?;
    Ok(JsonPersistenceResponse { exists, value })
}

fn load_string_persistence(path: PathBuf) -> Result<StringPersistenceResponse, String> {
    let (exists, value) = read_optional_json::<String>(&path)?;
    Ok(StringPersistenceResponse { exists, value })
}

fn load_last_review_session_snapshot_inner() -> Result<JsonPersistenceResponse, String> {
    let last_session_path = review_last_session_path()?;
    let (exists, session_id) = read_optional_json::<String>(&last_session_path)?;
    let Some(session_id) = session_id else {
        return Ok(JsonPersistenceResponse {
            exists,
            value: None,
        });
    };

    let snapshot_path = review_session_snapshot_path(&session_id)?;
    let (_, snapshot) = read_optional_json::<serde_json::Value>(&snapshot_path)?;
    if snapshot.is_none() {
        delete_file_if_exists(&last_session_path)?;
    }

    Ok(JsonPersistenceResponse {
        exists: true,
        value: snapshot,
    })
}

fn delete_review_session_snapshot_inner(session_id: &str) -> Result<(), String> {
    delete_file_if_exists(&review_session_snapshot_path(session_id)?)?;
    delete_file_if_exists(&review_active_file_path(session_id)?)?;

    let last_session_path = review_last_session_path()?;
    let (_, last_session_id) = read_optional_json::<String>(&last_session_path)?;
    if last_session_id.as_deref() == Some(session_id) {
        delete_file_if_exists(&last_session_path)?;
    }

    Ok(())
}

fn prune_review_session_snapshots_inner(
    request: PruneReviewSessionSnapshotsRequest,
) -> Result<(), String> {
    let mut active_ids = request
        .active_session_ids
        .into_iter()
        .filter_map(|id| review_ui_state_id(&id).ok())
        .collect::<HashSet<_>>();

    let (_, last_session_id) = read_optional_json::<String>(&review_last_session_path()?)?;
    if let Some(last_session_id) = last_session_id {
        if let Ok(last_session_id) = review_ui_state_id(&last_session_id) {
            active_ids.insert(last_session_id);
        }
    }

    prune_session_file_dir(&review_session_snapshots_dir()?, &active_ids)?;
    prune_session_file_dir(&review_active_files_dir()?, &active_ids)?;
    Ok(())
}

fn prune_session_file_dir(dir: &Path, active_ids: &HashSet<String>) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }

    for entry in
        fs::read_dir(dir).map_err(|error| format!("Failed to read {}: {error}", dir.display()))?
    {
        let entry = entry.map_err(|error| {
            format!("Failed to read directory entry {}: {error}", dir.display())
        })?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        if !active_ids.contains(stem) {
            delete_file_if_exists(&path)?;
        }
    }

    Ok(())
}

fn read_optional_json<T: DeserializeOwned>(path: &Path) -> Result<(bool, Option<T>), String> {
    let exists = path.exists();
    let value = crate::app_data::read_json(path)?;
    Ok((exists, value))
}

fn delete_file_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Failed to delete {}: {error}", path.display())),
    }
}

fn delete_dir_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Failed to delete {}: {error}", path.display())),
    }
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    crate::app_data::write_json_atomic(path, value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEMP_REPO_COUNTER: AtomicU64 = AtomicU64::new(0);
    static ENV_MUTEX: Mutex<()> = Mutex::new(());

    fn create_review_session(request: CreateReviewSessionRequest) -> Result<ReviewSession, String> {
        create_review_session_inner(request)
    }

    fn import_review_session(request: ImportReviewSessionRequest) -> Result<ReviewSession, String> {
        import_review_session_from_path(PathBuf::from(request.manifest_path))
    }

    fn load_review_diagram(
        request: LoadReviewDiagramRequest,
    ) -> Result<Option<serde_json::Value>, String> {
        load_review_diagram_inner(request)
    }

    fn save_review_diagram(request: SaveReviewDiagramRequest) -> Result<serde_json::Value, String> {
        save_review_diagram_inner(request)
    }

    #[test]
    fn parses_hunk_header_with_counts() {
        assert_eq!(
            parse_hunk_header("@@ -12,7 +14,9 @@ fn test"),
            (12, 7, 14, 9)
        );
    }

    #[test]
    fn base64_encode_handles_padding() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"a"), "YQ==");
        assert_eq!(base64_encode(b"ab"), "YWI=");
        assert_eq!(base64_encode(b"abc"), "YWJj");
    }

    #[test]
    fn loads_worktree_image_asset_preview_with_before_and_after() {
        let repo = temp_repo();
        fs::create_dir_all(repo.join("icons")).unwrap();
        fs::write(repo.join("icons/icon.png"), [1_u8, 2, 3]).unwrap();
        run_git(&repo, &["init"]);
        run_git(&repo, &["config", "user.email", "review-desk@example.test"]);
        run_git(&repo, &["config", "user.name", "Review Desk Test"]);
        run_git(&repo, &["add", "icons/icon.png"]);
        run_git(&repo, &["commit", "-m", "initial icon"]);
        fs::write(repo.join("icons/icon.png"), [4_u8, 5, 6]).unwrap();

        let preview = load_review_asset_preview_inner(LoadReviewAssetPreviewRequest {
            repo_path: repo.display().to_string(),
            file_path: "icons/icon.png".to_string(),
            old_path: None,
            change_kind: ChangeKind::Modified,
            diff_target: "HEAD".to_string(),
        })
        .unwrap();

        assert_eq!(preview.mime_type, "image/png");
        assert!(preview.old.unwrap().data_url.ends_with("AQID"));
        assert!(preview.new.unwrap().data_url.ends_with("BAUG"));

        fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn loads_reference_sources_for_review_files_and_local_imports() {
        let repo = temp_repo();
        fs::create_dir_all(repo.join("src")).unwrap();
        fs::write(
            repo.join("src/use.ts"),
            "import { target } from './defs';\nexport const result = target();\n",
        )
        .unwrap();
        fs::write(
            repo.join("src/defs.ts"),
            "export function target() { return 1; }\n",
        )
        .unwrap();
        fs::write(repo.join("README.md"), "not indexed\n").unwrap();
        run_git(&repo, &["init"]);

        let sources = load_review_reference_sources_inner(LoadReviewReferenceSourcesRequest {
            repo_path: repo.display().to_string(),
            files: vec![
                ReviewReferenceSourceRequestFile {
                    path: "src/use.ts".to_string(),
                    change_kind: ChangeKind::Modified,
                },
                ReviewReferenceSourceRequestFile {
                    path: "README.md".to_string(),
                    change_kind: ChangeKind::Modified,
                },
            ],
            max_file_bytes: Some(1024),
            include_imports: Some(true),
        })
        .unwrap();

        let paths = sources
            .files
            .iter()
            .map(|source| source.path.as_str())
            .collect::<Vec<_>>();
        assert!(paths.contains(&"src/use.ts"));
        assert!(paths.contains(&"src/defs.ts"));
        assert!(!paths.contains(&"README.md"));
        assert!(sources
            .files
            .iter()
            .any(|source| { source.path == "src/use.ts" && source.is_review_file }));
        assert!(sources
            .files
            .iter()
            .any(|source| { source.path == "src/defs.ts" && !source.is_review_file }));

        fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn rejects_reference_source_paths_outside_repo() {
        let repo = temp_repo();
        fs::create_dir_all(&repo).unwrap();
        run_git(&repo, &["init"]);

        let error = load_review_reference_sources_inner(LoadReviewReferenceSourcesRequest {
            repo_path: repo.display().to_string(),
            files: vec![ReviewReferenceSourceRequestFile {
                path: "../secret.ts".to_string(),
                change_kind: ChangeKind::Modified,
            }],
            max_file_bytes: Some(1024),
            include_imports: Some(true),
        })
        .unwrap_err();

        assert!(error.contains("Invalid review file path"));
        fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn accepts_safe_review_file_paths() {
        assert_eq!(
            safe_relative_review_path("src/components/App.tsx").unwrap(),
            PathBuf::from("src/components/App.tsx")
        );
        assert_eq!(
            safe_relative_review_path("./README.md").unwrap(),
            PathBuf::from("README.md")
        );
    }

    #[test]
    fn rejects_review_file_paths_outside_repo() {
        assert!(safe_relative_review_path("../secret.txt").is_err());
        assert!(safe_relative_review_path("/tmp/secret.txt").is_err());
        assert!(safe_relative_review_path("").is_err());
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
    fn reuses_cached_pull_request_ref_when_sha_matches() {
        let repo = temp_repo();
        fs::create_dir_all(&repo).unwrap();
        fs::write(repo.join("README.md"), "initial\n").unwrap();
        run_git(&repo, &["init"]);
        run_git(&repo, &["config", "user.email", "review-desk@example.test"]);
        run_git(&repo, &["config", "user.name", "Review Desk Test"]);
        run_git(&repo, &["add", "README.md"]);
        run_git(&repo, &["commit", "-m", "initial"]);

        let head = git_stdout(&repo, &["rev-parse", "HEAD"]).unwrap();
        let head = head.trim();
        run_git(
            &repo,
            &["update-ref", "refs/remotes/review-desk/pr-7", head],
        );

        assert_eq!(
            reusable_pull_request_head_ref(&repo, 7, Some(head)).as_deref(),
            Some("refs/remotes/review-desk/pr-7")
        );
        assert_eq!(
            reusable_pull_request_head_ref(
                &repo,
                7,
                Some("0000000000000000000000000000000000000000"),
            ),
            None
        );

        fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn builds_stable_repo_storage_key() {
        assert_eq!(
            repo_storage_key(Path::new("/tmp/example")),
            "example-fbb113d314e487d2"
        );
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
    fn saves_and_loads_review_diagram_from_app_data() {
        let _guard = ENV_MUTEX.lock().unwrap();
        let repo = temp_repo();
        let data_dir = temp_repo();
        fs::create_dir_all(&repo).unwrap();
        fs::create_dir_all(&data_dir).unwrap();
        fs::write(repo.join("README.md"), "initial\n").unwrap();
        run_git(&repo, &["init"]);
        run_git(&repo, &["config", "user.email", "review-desk@example.test"]);
        run_git(&repo, &["config", "user.name", "Review Desk Test"]);
        run_git(&repo, &["add", "README.md"]);
        run_git(&repo, &["commit", "-m", "initial"]);

        std::env::set_var("REVIEW_DESK_DATA_DIR", &data_dir);
        let diagram = serde_json::json!({
            "version": 1,
            "id": "diagram-test",
            "sessionId": "agent-session-test",
            "scope": "session",
            "kind": "reviewMap",
            "format": "mermaid",
            "source": "flowchart LR\n  A-->B\n"
        });

        save_review_diagram(SaveReviewDiagramRequest {
            repo_path: repo.display().to_string(),
            diagram: diagram.clone(),
        })
        .unwrap();
        let loaded = load_review_diagram(LoadReviewDiagramRequest {
            repo_path: repo.display().to_string(),
            session_id: "agent-session-test".to_string(),
            scope: Some("session".to_string()),
        })
        .unwrap()
        .unwrap();
        let canonical_repo = repo_root(&repo.display().to_string()).unwrap();

        assert_eq!(loaded["id"], "diagram-test");
        assert!(
            review_diagram_path(&canonical_repo, "agent-session-test", "session")
                .unwrap()
                .exists()
        );

        std::env::remove_var("REVIEW_DESK_DATA_DIR");
        fs::remove_dir_all(repo).unwrap();
        fs::remove_dir_all(data_dir).unwrap();
    }

    #[test]
    fn persists_review_ui_state_in_app_data() {
        let _guard = ENV_MUTEX.lock().unwrap();
        let data_dir = temp_repo();
        fs::create_dir_all(&data_dir).unwrap();
        std::env::set_var("REVIEW_DESK_DATA_DIR", &data_dir);

        let session = serde_json::json!({
            "id": "session-test",
            "repo": { "root": "/tmp/repo" }
        });
        write_json_file(
            &review_session_snapshot_path("session-test").unwrap(),
            &session,
        )
        .unwrap();
        write_json_file(
            &review_last_session_path().unwrap(),
            &"session-test".to_string(),
        )
        .unwrap();
        let loaded = load_last_review_session_snapshot_inner().unwrap();
        assert!(loaded.exists);
        assert_eq!(loaded.value.unwrap()["id"], "session-test");

        let history = vec![serde_json::json!({ "id": "session-test" })];
        write_json_file(&review_history_path().unwrap(), &history).unwrap();
        let loaded_history = load_json_array_persistence(review_history_path().unwrap()).unwrap();
        assert!(loaded_history.exists);
        assert_eq!(loaded_history.value.len(), 1);

        delete_review_session_snapshot_inner("session-test").unwrap();
        assert!(!review_session_snapshot_path("session-test")
            .unwrap()
            .exists());
        assert!(!review_last_session_path().unwrap().exists());

        std::env::remove_var("REVIEW_DESK_DATA_DIR");
        fs::remove_dir_all(data_dir).unwrap();
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
            ],
            "excludedPaths": [
                {
                    "path": "pnpm-lock.yaml",
                    "reason": "Agent excluded lockfile noise."
                },
                {
                    "path": ".review-desk/sessions/review.review-session.json",
                    "reason": "Agent excluded its own session manifest."
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
    fn import_manifest_target_takes_precedence_over_legacy_refs() {
        let repo = temp_repo();
        fs::create_dir_all(repo.join(".review-desk/sessions")).unwrap();
        fs::create_dir_all(repo.join("src")).unwrap();
        fs::write(repo.join("README.md"), "initial\n").unwrap();
        run_git(&repo, &["init"]);
        run_git(&repo, &["config", "user.email", "review-desk@example.test"]);
        run_git(&repo, &["config", "user.name", "Review Desk Test"]);
        run_git(&repo, &["add", "README.md"]);
        run_git(&repo, &["commit", "-m", "initial"]);

        fs::write(repo.join("README.md"), "initial\ncommitted\n").unwrap();
        run_git(&repo, &["add", "README.md"]);
        run_git(&repo, &["commit", "-m", "change readme"]);
        fs::write(repo.join("src/worktree.rs"), "pub fn dirty() {}\n").unwrap();

        let manifest_path = repo
            .join(".review-desk")
            .join("sessions")
            .join("commit.review-session.json");
        let manifest = serde_json::json!({
            "version": 1,
            "repoRoot": repo.display().to_string(),
            "baseRef": "HEAD",
            "headRef": "WORKTREE",
            "target": {
                "kind": "commit",
                "commit": "HEAD"
            },
            "title": "Review one commit",
            "createdBy": "codex",
            "fileOrder": [
                {
                    "path": "README.md",
                    "group": "Commit",
                    "reason": "This is the selected commit."
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
        let paths = session
            .files
            .iter()
            .map(|file| file.path.as_str())
            .collect::<Vec<_>>();

        assert!(matches!(session.target, ReviewTarget::Commit { .. }));
        assert!(paths.contains(&"README.md"));
        assert!(!paths.contains(&"src/worktree.rs"));

        fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn keeps_agent_session_id_stable_when_manifest_moves() {
        let repo = temp_repo();
        fs::create_dir_all(repo.join(".review-desk/sessions")).unwrap();
        fs::create_dir_all(repo.join("src")).unwrap();
        fs::write(repo.join("README.md"), "initial\n").unwrap();
        run_git(&repo, &["init"]);
        run_git(&repo, &["config", "user.email", "review-desk@example.test"]);
        run_git(&repo, &["config", "user.name", "Review Desk Test"]);
        run_git(&repo, &["add", "README.md"]);
        run_git(&repo, &["commit", "-m", "initial"]);

        fs::write(repo.join("README.md"), "initial\nchanged\n").unwrap();

        let legacy_manifest_path = repo
            .join(".review-desk")
            .join("sessions")
            .join("review.review-session.json");
        let app_manifest_path = temp_repo()
            .join("sessions")
            .join("review.review-session.json");
        fs::create_dir_all(app_manifest_path.parent().unwrap()).unwrap();
        let manifest_content = serde_json::to_string_pretty(&serde_json::json!({
            "version": 1,
            "repoRoot": repo.display().to_string(),
            "target": {
                "kind": "workingTree"
            },
            "title": "Review moved manifest",
            "createdBy": "codex",
            "fileOrder": [
                {
                    "path": "README.md",
                    "group": "Entry points",
                    "reason": "Review the readme change."
                }
            ]
        }))
        .unwrap();
        fs::write(&legacy_manifest_path, &manifest_content).unwrap();
        fs::write(&app_manifest_path, &manifest_content).unwrap();

        let legacy_session = import_review_session(ImportReviewSessionRequest {
            manifest_path: legacy_manifest_path.display().to_string(),
        })
        .unwrap();
        let app_session = import_review_session(ImportReviewSessionRequest {
            manifest_path: app_manifest_path.display().to_string(),
        })
        .unwrap();
        let canonical_legacy_manifest_path = PathBuf::from(&app_session.repo.root)
            .join(".review-desk")
            .join("sessions")
            .join("review.review-session.json");
        let old_legacy_id = path_manifest_session_id(
            &app_session.repo.root,
            app_session.patch_artifact.diff_target.as_str(),
            &canonical_legacy_manifest_path,
        );

        assert_eq!(legacy_session.id, app_session.id);
        assert!(app_session.legacy_session_ids.contains(&old_legacy_id));

        fs::remove_dir_all(repo).unwrap();
        fs::remove_dir_all(app_manifest_path.parent().unwrap().parent().unwrap()).unwrap();
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
        assert!(paths.contains(&"pnpm-lock.yaml"));
        assert!(session.excluded_files.is_empty());

        fs::remove_dir_all(repo).unwrap();
    }

    #[test]
    fn direct_sessions_include_binary_icon_changes() {
        let repo = temp_repo();
        fs::create_dir_all(repo.join("src-tauri/icons")).unwrap();
        fs::write(repo.join("README.md"), "initial\n").unwrap();
        fs::write(repo.join("src-tauri/icons/icon.png"), [0_u8, 1, 2, 3]).unwrap();
        run_git(&repo, &["init"]);
        run_git(&repo, &["config", "user.email", "review-desk@example.test"]);
        run_git(&repo, &["config", "user.name", "Review Desk Test"]);
        run_git(&repo, &["add", "."]);
        run_git(&repo, &["commit", "-m", "initial"]);

        fs::write(repo.join("src-tauri/icons/icon.png"), [0_u8, 1, 2, 4]).unwrap();

        let session = create_review_session(CreateReviewSessionRequest {
            repo_path: repo.display().to_string(),
            base_ref: None,
            head_ref: None,
            target: Some(ReviewTargetRequest::WorkingTree),
        })
        .unwrap();

        let icon = session
            .files
            .iter()
            .find(|file| file.path == "src-tauri/icons/icon.png")
            .expect("binary icon should stay in direct sessions");
        assert!(icon.hunks.is_empty());
        assert!(session.excluded_files.is_empty());

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
