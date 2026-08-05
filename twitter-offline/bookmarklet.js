/*
 * Twitter Offline — feed capture bookmarklet.
 *
 * How it works: instead of hand-crafting X's internal GraphQL requests
 * (which need an auth token, a CSRF token, and a large "features" flag
 * object that X changes often), this patches window.fetch to snoop on
 * the GraphQL responses that x.com's OWN javascript already makes as you
 * scroll. It never sends anything anywhere except back to your own
 * browser tab, and never touches your password or session directly —
 * it just reads responses your browser already received.
 *
 * Works on any timeline: Home (For You / Following), a profile, a
 * thread, Bookmarks, Likes — anywhere tweet data flows through a
 * /graphql/ response while this is active.
 *
 * This uses X's undocumented internal API, which is against X's Terms
 * of Service. It's meant for personal, occasional use to save your own
 * feed for offline reading. Use at your own risk; it may stop working
 * if X changes its app.
 */
(function () {
  var NS = "__twOfflineCapture";

  if (window[NS]) {
    window[NS].show();
    return;
  }

  var state = { tweets: new Map(), startedAt: Date.now() };

  function textOf(node) {
    var legacy = node.legacy || node;
    var text = legacy.full_text || legacy.text || "";
    var note =
      node.note_tweet &&
      node.note_tweet.note_tweet_results &&
      node.note_tweet.note_tweet_results.result;
    if (note && note.text) text = note.text;
    return text;
  }

  function mediaOf(legacy) {
    var out = [];
    var ext = legacy.extended_entities || legacy.entities;
    var items = (ext && ext.media) || [];
    items.forEach(function (m) {
      if (m.type === "photo") {
        out.push({ type: "photo", url: m.media_url_https + "?format=jpg&name=large" });
      } else if (m.type === "video" || m.type === "animated_gif") {
        var variants = ((m.video_info && m.video_info.variants) || []).filter(function (v) {
          return v.content_type === "video/mp4";
        });
        variants.sort(function (a, b) {
          return (b.bitrate || 0) - (a.bitrate || 0);
        });
        if (variants[0]) {
          out.push({
            type: m.type === "animated_gif" ? "gif" : "video",
            url: variants[0].url,
            posterUrl: m.media_url_https,
          });
        }
      }
    });
    return out;
  }

  function parseTweetNode(node) {
    try {
      var legacy = node.legacy;
      if (!legacy) return null;
      var id = node.rest_id || legacy.id_str;
      if (!id) return null;
      var userResult = node.core && node.core.user_results && node.core.user_results.result;
      var userLegacy = userResult && (userResult.legacy || userResult);
      var author = {
        name: (userLegacy && (userLegacy.name || userLegacy.legacy_screen_name)) || "Unknown",
        handle: (userLegacy && userLegacy.screen_name) || "",
        avatarUrl: (userLegacy && userLegacy.profile_image_url_https) || "",
      };
      return {
        id: id,
        author: author,
        text: textOf(node),
        createdAt: legacy.created_at,
        favoriteCount: legacy.favorite_count || 0,
        media: mediaOf(legacy),
        permalinkUrl: "https://x.com/" + (author.handle || "i") + "/status/" + id,
      };
    } catch (e) {
      return null;
    }
  }

  function walk(obj, depth) {
    if (!obj || typeof obj !== "object" || depth > 40) return;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) walk(obj[i], depth + 1);
      return;
    }
    var isTweet =
      obj.__typename === "Tweet" ||
      obj.__typename === "TweetWithVisibilityResults" ||
      (obj.legacy && obj.legacy.full_text !== undefined && (obj.rest_id || obj.legacy.id_str));
    if (isTweet) {
      var inner = obj.__typename === "TweetWithVisibilityResults" && obj.tweet ? obj.tweet : obj;
      var parsed = parseTweetNode(inner);
      if (parsed) state.tweets.set(parsed.id, parsed);
    }
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) walk(obj[k], depth + 1);
    }
  }

  var origFetch = window.fetch;
  window.fetch = function () {
    var args = arguments;
    return origFetch.apply(window, args).then(function (res) {
      try {
        var url = typeof args[0] === "string" ? args[0] : args[0] && args[0].url;
        if (url && url.indexOf("/graphql/") !== -1 && res.ok) {
          res
            .clone()
            .json()
            .then(function (json) {
              walk(json, 0);
              render();
            })
            .catch(function () {});
        }
      } catch (e) {}
      return res;
    });
  };

  var panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#171a21;" +
    "color:#e7eaf0;border:1px solid #262b36;border-radius:14px;padding:14px 16px;" +
    "font:14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.45);" +
    "width:220px;";
  panel.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
    '<span style="width:8px;height:8px;border-radius:50%;background:#46d39a;box-shadow:0 0 0 3px rgba(70,211,154,.15);"></span>' +
    '<strong>Twitter Offline</strong></div>' +
    '<div id="tw-offline-count" style="color:#9aa3b2;margin-bottom:10px;">0 tweets captured</div>' +
    '<div style="color:#9aa3b2;font-size:12px;margin-bottom:10px;">Scroll to load more, then save.</div>' +
    '<button id="tw-offline-save" style="width:100%;background:linear-gradient(90deg,#5b9dff,#7c5cff);border:0;' +
    'color:#fff;font-weight:600;padding:9px 0;border-radius:9px;margin-bottom:6px;">Save & Download</button>' +
    '<button id="tw-offline-hide" style="width:100%;background:#1d212b;border:1px solid #262b36;' +
    'color:#9aa3b2;padding:7px 0;border-radius:9px;">Hide</button>';
  document.documentElement.appendChild(panel);

  function render() {
    var el = document.getElementById("tw-offline-count");
    if (el) el.textContent = state.tweets.size + " tweets captured";
  }

  function download() {
    var payload = {
      exportedAt: new Date().toISOString(),
      source: location.href,
      tweets: Array.from(state.tweets.values()),
    };
    var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "twitter-offline-" + Date.now() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 5000);
  }

  document.getElementById("tw-offline-save").addEventListener("click", download);
  document.getElementById("tw-offline-hide").addEventListener("click", function () {
    panel.style.display = "none";
  });

  window[NS] = {
    state: state,
    show: function () {
      panel.style.display = "block";
    },
  };

  render();
})();
