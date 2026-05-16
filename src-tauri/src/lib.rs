mod app_data;
mod blocking;
mod github;
mod review;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|_app| {
            set_macos_dock_icon();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            review::create_review_session,
            review::get_active_review_session,
            review::get_global_active_review_session,
            review::import_active_review_session,
            review::import_global_active_review_session,
            review::import_review_session,
            review::list_review_refs,
            review::load_review_diagram,
            review::load_review_workspace_state,
            review::open_review_file,
            review::save_review_diagram,
            review::save_review_workspace_state,
            review::save_text_file,
            github::auth::get_github_viewer,
            github::inbox::list_my_pull_requests,
            github::context::load_pull_request_context,
            github::refresh::refresh_pull_request_head,
            github::publish::publish_pull_request_review,
            github::merge::merge_pull_request,
            github::prefs::get_repo_prefs,
            github::prefs::set_repo_prefs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(target_os = "macos")]
fn set_macos_dock_icon() {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSString;

    let Some(main_thread) = MainThreadMarker::new() else {
        return;
    };

    let icon_path = NSString::from_str(concat!(env!("CARGO_MANIFEST_DIR"), "/icons/icon.png"));
    let Some(icon) = NSImage::initWithContentsOfFile(main_thread.alloc(), &icon_path) else {
        return;
    };

    let application = NSApplication::sharedApplication(main_thread);
    unsafe {
        application.setApplicationIconImage(Some(&icon));
    }
}

#[cfg(not(target_os = "macos"))]
fn set_macos_dock_icon() {}
