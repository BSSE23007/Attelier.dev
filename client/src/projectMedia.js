export function isLocalProjectAsset(path) {
  return typeof path === "string"
    && path.startsWith("/projects/")
    && !path.startsWith("//")
    && !path.includes("..")
    && !/[?#\\]/.test(path);
}

export function youtubeEmbedUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    let videoId = "";
    if (["youtu.be", "www.youtu.be"].includes(url.hostname)) {
      videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
      if (url.pathname === "/watch") videoId = url.searchParams.get("v") || "";
      else if (/^\/(embed|shorts)\//.test(url.pathname)) videoId = url.pathname.split("/")[2] || "";
    }
    return /^[A-Za-z0-9_-]{11}$/.test(videoId)
      ? `https://www.youtube-nocookie.com/embed/${videoId}`
      : "";
  } catch {
    return "";
  }
}

export function safeLiveUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}
