use super::*;

fn app(id: &str, name: &str) -> App {
    App {
        id: id.into(),
        name: name.into(),
    }
}

fn list(names: &[&str]) -> Vec<String> {
    names.iter().map(|n| n.to_string()).collect()
}

#[test]
fn windows_apps_are_named_by_their_executable() {
    assert_eq!(
        App::from_exe("Spotify.exe"),
        Some(app("Spotify.exe", "Spotify"))
    );
    assert_eq!(App::from_exe("obs64.EXE"), Some(app("obs64.EXE", "obs64")));
    assert_eq!(App::from_exe("noext"), Some(app("noext", "noext")));
    assert_eq!(App::from_exe("  "), None);
}

#[test]
fn linux_streams_fall_back_between_binary_and_name() {
    assert_eq!(
        App::from_stream(Some("firefox"), Some("Firefox")),
        Some(app("firefox", "Firefox"))
    );
    assert_eq!(
        App::from_stream(None, Some("Firefox")),
        Some(app("Firefox", "Firefox"))
    );
    assert_eq!(
        App::from_stream(Some("mpv"), Some(" ")),
        Some(app("mpv", "mpv"))
    );
    assert_eq!(App::from_stream(None, None), None);
    assert_eq!(App::from_stream(Some(""), Some("")), None);
}

#[test]
fn only_matches_one_id_without_case() {
    let only = AppFilter::new(Some("Spotify.exe".into())).unwrap();
    assert!(only.admits(Some("spotify.exe")));
    assert!(only.admits(Some("SPOTIFY.EXE")));
    assert!(!only.admits(Some("spotify")));
    assert!(!only.admits(Some("firefox.exe")));
    assert!(
        !only.admits(None),
        "audio of no application is not that application"
    );
}

#[test]
fn no_only_shares_everything() {
    let all = AppFilter::new(None).unwrap();
    assert_eq!(all, AppFilter::All);
    assert!(all.admits(Some("anything")));
    assert!(all.admits(None));
}

#[test]
fn blank_only_is_refused() {
    assert!(AppFilter::new(Some(String::new())).is_err());
    assert!(AppFilter::new(Some("  ".into())).is_err());
}

#[test]
fn list_is_deduplicated_and_sorted_by_name() {
    let listed = app_list([
        app("vlc", "VLC media player"),
        app("firefox", "Firefox"),
        app("chrome.exe", "chrome"),
        app("Chrome.exe", "Chrome"),
        app("firefox", "Firefox"),
        app("aplay", "aplay"),
    ]);
    let ids: Vec<&str> = listed.iter().map(|a| a.id.as_str()).collect();
    assert_eq!(ids.len(), 4, "{listed:?}");
    assert_eq!(&ids[0], &"aplay");
    assert!(ids[1].eq_ignore_ascii_case("chrome.exe"));
    assert_eq!(&ids[2..], &["firefox", "vlc"]);
}

#[test]
fn duplicates_keep_the_same_entry_whatever_the_order() {
    let a = [
        app("chromium", "Chromium"),
        app("chromium", "Chromium input"),
    ];
    let b = [
        app("chromium", "Chromium input"),
        app("chromium", "Chromium"),
    ];
    assert_eq!(app_list(a.clone()), app_list(b));
    assert_eq!(app_list(a), vec![app("chromium", "Chromium")]);
}

#[test]
fn exclusions_match_without_case_or_extension() {
    let exclude = list(&["VoiceChat.exe", "pinniped"]);
    assert!(is_excluded("voicechat.exe", &exclude));
    assert!(is_excluded("Pinniped.exe", &exclude));
    assert!(!is_excluded("PinnipedHelper.exe", &exclude));
    assert!(!is_excluded("steam.exe", &exclude));
}

#[test]
fn blank_exclusions_match_nothing() {
    assert!(!is_excluded("a.exe", &list(&["", "  "])));
    assert!(!is_excluded("a.exe", &[]));
}
