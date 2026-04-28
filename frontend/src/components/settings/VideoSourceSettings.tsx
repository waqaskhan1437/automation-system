"use client";
import { useEffect, useState, type ChangeEvent } from "react";
import { ExternalLink, Info } from "lucide-react";

export default function VideoSourceSettings() {
  const [bunnyApiKey, setBunnyApiKey] = useState("");
  const [bunnyLibraryId, setBunnyLibraryId] = useState("");
  const [youtubeCookies, setYoutubeCookies] = useState("");
  const [googlePhotosCookies, setGooglePhotosCookies] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [youtubeCookieFileName, setYoutubeCookieFileName] = useState("");
  const [youtubeUploadMessage, setYoutubeUploadMessage] = useState("");
  const [youtubeUploadError, setYoutubeUploadError] = useState("");
  const [googlePhotosCookieFileName, setGooglePhotosCookieFileName] = useState("");
  const [googlePhotosUploadMessage, setGooglePhotosUploadMessage] = useState("");
  const [googlePhotosUploadError, setGooglePhotosUploadError] = useState("");
  const [uploadingSource, setUploadingSource] = useState<"youtube" | "google_photos" | null>(null);
  const [activeTab, setActiveTab] = useState<"youtube" | "google_photos" | "bunny">("youtube");
  const [saveError, setSaveError] = useState("");

  const loadSettings = async () => {
    const response = await fetch("/api/settings/video-sources");
    const data = await response.json();
    if (data.success && data.data) {
      setBunnyApiKey(data.data.bunny_api_key || "");
      setBunnyLibraryId(data.data.bunny_library_id || "");
      setYoutubeCookies(data.data.youtube_cookies || "");
      setGooglePhotosCookies(data.data.google_photos_cookies || "");
      setYoutubeCookieFileName(data.data.youtube_cookies ? "Stored on server" : "");
      setGooglePhotosCookieFileName(data.data.google_photos_cookies ? "Stored on server" : "");
      return;
    }

    setBunnyApiKey("");
    setBunnyLibraryId("");
    setYoutubeCookies("");
    setGooglePhotosCookies("");
    setYoutubeCookieFileName("");
    setGooglePhotosCookieFileName("");
  };

  const handleCookieUpload = async (source: "youtube" | "google_photos", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadingSource(source);
    if (source === "youtube") {
      setYoutubeUploadError("");
      setYoutubeUploadMessage("");
    } else {
      setGooglePhotosUploadError("");
      setGooglePhotosUploadMessage("");
    }

    try {
      const formData = new FormData();
      formData.append("source", source);
      formData.append("file", file);

      const response = await fetch("/api/settings/video-sources/upload", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Cookies upload failed");
      }

      if (source === "youtube") {
        setYoutubeCookieFileName(file.name);
        setYoutubeUploadMessage("YouTube cookies file upload ho gayi. New session ab server par save ho gayi hai aur GitHub Actions plus local runner dono next runs me isi ko use karenge.");
      } else {
        setGooglePhotosCookieFileName(file.name);
        setGooglePhotosUploadMessage("Google Photos cookies file upload ho gayi. Private album/share downloads ab fresh server session se chalenge.");
      }
      await loadSettings();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cookies upload failed";
      if (source === "youtube") {
        setYoutubeUploadError(message);
      } else {
        setGooglePhotosUploadError(message);
      }
    } finally {
      setUploadingSource(null);
      event.target.value = "";
    }
  };

  useEffect(() => {
    loadSettings().catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      const response = await fetch("/api/settings/video-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bunny_api_key: bunnyApiKey,
          bunny_library_id: bunnyLibraryId,
          youtube_cookies: youtubeCookies,
          google_photos_cookies: googlePhotosCookies,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to save settings");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save settings");
    }
    setSaving(false);
  };

  return (
    <div>
      <h3 className="text-xl font-semibold mb-6">Video Source Settings</h3>
      <div className="flex gap-2 mb-6">
        {[
          { id: "youtube" as const, label: "YouTube Cookies" },
          { id: "google_photos" as const, label: "Google Photos" },
          { id: "bunny" as const, label: "Bunny CDN" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white"
                : "glass-button"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {activeTab === "youtube" && (
        <div className="border-t border-gray-700 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <h4 className="text-lg font-medium text-red-400">YouTube Cookies Session</h4>
            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded">YouTube only</span>
          </div>
          <div className="glass-card p-3 mb-3 bg-red-500/10 border-red-500/30">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-200">
                Yeh upload sirf YouTube video aur YouTube channel downloads ke liye use hogi. New `.txt` file upload karte hi purani session replace ho jayegi, aur GitHub Actions plus local runner dono next run se updated cookies use karenge.
                <a
                  href="https://github.com/yt-dlp/yt-dlp/wiki/Cookies"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline ml-1 inline-flex items-center gap-1"
                >
                  How to get cookies <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
          </div>
          <div>
            <label className="block text-sm text-[#a1a1aa] mb-2">Upload YouTube Cookies `.txt` File</label>
            <input
              type="file"
              accept=".txt,text/plain"
              className="glass-input file:mr-4 file:border-0 file:bg-red-500/20 file:px-3 file:py-2 file:text-sm file:text-red-200"
              onChange={(event) => handleCookieUpload("youtube", event)}
              disabled={uploadingSource === "youtube"}
            />
            <p className="text-xs text-[#71717a] mt-1">
              {youtubeCookieFileName ? `Current server session: ${youtubeCookieFileName}` : "Upload a Netscape-format cookies text file"}
            </p>
          </div>
          {youtubeUploadMessage && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {youtubeUploadMessage}
            </div>
          )}
          {youtubeUploadError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {youtubeUploadError}
            </div>
          )}
          <div className="mt-4">
            <label className="block text-sm text-[#a1a1aa] mb-2">YouTube Cookies (Netscape format)</label>
            <textarea
              className="glass-input h-24 font-mono text-xs"
              placeholder="# Netscape HTTP Cookie File&#10;.youtube.com TRUE / TRUE 9999999999 CONSENT yes+...&#10;.youtube.com TRUE / TRUE 9999999999 SID your_session_id..."
              value={youtubeCookies}
              onChange={(e) => setYoutubeCookies(e.target.value)}
            />
            <p className="text-xs text-[#71717a] mt-1">Manual paste bhi allowed hai, lekin robust replacement ke liye upload option use karein.</p>
          </div>
        </div>
        )}

        {activeTab === "google_photos" && (
        <div className="border-t border-gray-700 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <h4 className="text-lg font-medium text-green-400">Google Photos Settings</h4>
          </div>
          <div className="glass-card p-3 mb-3 bg-green-500/10 border-green-500/30">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-green-200">
                Required for private albums. Upload a fresh Netscape-format cookies file so GitHub Actions aur local runner dono Google Photos access ko same server session se resolve kar sakein.
              </p>
            </div>
          </div>
          <div>
            <label className="block text-sm text-[#a1a1aa] mb-2">Upload Google Photos Cookies `.txt` File</label>
            <input
              type="file"
              accept=".txt,text/plain"
              className="glass-input file:mr-4 file:border-0 file:bg-green-500/20 file:px-3 file:py-2 file:text-sm file:text-green-200"
              onChange={(event) => handleCookieUpload("google_photos", event)}
              disabled={uploadingSource === "google_photos"}
            />
            <p className="text-xs text-[#71717a] mt-1">
              {googlePhotosCookieFileName ? `Current server session: ${googlePhotosCookieFileName}` : "Upload a Netscape-format cookies text file"}
            </p>
          </div>
          {googlePhotosUploadMessage && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {googlePhotosUploadMessage}
            </div>
          )}
          {googlePhotosUploadError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {googlePhotosUploadError}
            </div>
          )}
          <div>
            <label className="block text-sm text-[#a1a1aa] mb-2">Google Photos Cookies (Netscape format)</label>
            <textarea
              className="glass-input h-24 font-mono text-xs"
              placeholder="# Netscape HTTP Cookie File&#10;.google.com TRUE / TRUE 9999999999 SID your_session..."
              value={googlePhotosCookies}
              onChange={(e) => setGooglePhotosCookies(e.target.value)}
            />
          </div>
        </div>
        )}

        {activeTab === "bunny" && (
        <div className="border-t border-gray-700 pt-4">
          <h4 className="text-lg font-medium mb-3 text-purple-400">Bunny CDN (Optional)</h4>
          <div>
            <label className="block text-sm text-[#a1a1aa] mb-2">Bunny CDN API Key</label>
            <input type="password" className="glass-input" placeholder="Enter Bunny CDN API key" value={bunnyApiKey} onChange={(e) => setBunnyApiKey(e.target.value)} />
          </div>
          <div className="mt-4">
            <label className="block text-sm text-[#a1a1aa] mb-2">Bunny CDN Library ID</label>
            <input type="text" className="glass-input" placeholder="Library ID from Bunny dashboard" value={bunnyLibraryId} onChange={(e) => setBunnyLibraryId(e.target.value)} />
          </div>
        </div>
        )}

        <button onClick={handleSave} disabled={saving} className="glass-button-primary mt-4">
          {saving ? "Saving..." : "Save Video Source Settings"}
        </button>

        {saved && (
          <p className="text-green-400 text-sm mt-2">Settings saved successfully.</p>
        )}
        {saveError && (
          <p className="text-red-400 text-sm mt-2">{saveError}</p>
        )}
      </div>
    </div>
  );
}
