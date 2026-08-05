(function () {
  // ---------- tabs ----------
  const tabs = document.querySelectorAll("nav.tabbar button");
  const views = document.querySelectorAll("main .view");
  function showView(name) {
    tabs.forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    views.forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
    if (name === "feed") renderFeed();
    if (name === "settings") renderSettings();
  }
  tabs.forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

  // ---------- network indicator ----------
  function updateNetStatus() {
    const dot = document.getElementById("netDot");
    const label = document.getElementById("netLabel");
    const online = navigator.onLine;
    dot.className = "dot " + (online ? "online" : "offline");
    label.textContent = online ? "Online" : "Offline";
  }
  window.addEventListener("online", updateNetStatus);
  window.addEventListener("offline", updateNetStatus);
  updateNetStatus();

  // ---------- helpers ----------
  function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
      " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  function safeHref(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
  }
  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach((k) => {
        if (k === "class") node.className = props[k];
        else if (k === "text") node.textContent = props[k];
        else node.setAttribute(k, props[k]);
      });
    }
    (children || []).forEach((c) => c && node.appendChild(c));
    return node;
  }

  // ---------- feed rendering ----------
  function buildMedia(media) {
    if (!media || !media.length) return null;
    const count = Math.min(media.length, 4);
    const wrap = el("div", { class: "media n" + count });
    media.slice(0, 4).forEach((m) => {
      if (m.type === "photo") {
        wrap.appendChild(el("img", { src: m.url, loading: "lazy", alt: "" }));
      } else {
        const v = el("video", { controls: "", playsinline: "", preload: "none" });
        if (m.posterUrl) v.setAttribute("poster", m.posterUrl);
        v.src = m.url;
        wrap.appendChild(v);
      }
    });
    return wrap;
  }

  function buildTweetCard(t) {
    const head = el("div", { class: "head" }, [
      el("img", { class: "avatar", src: t.author.avatarUrl || "icons/icon-192.png", alt: "" }),
      el("div", { class: "who" }, [
        el("div", { class: "name", text: t.author.name || "Unknown" }),
        el("div", { class: "handle", text: t.author.handle ? "@" + t.author.handle : "" }),
      ]),
      el("div", { class: "time", text: fmtDate(t.createdAt) }),
    ]);
    const text = el("div", { class: "text", text: t.text || "" });
    const mediaNode = buildMedia(t.media);
    const children = [head, text];
    if (mediaNode) children.push(mediaNode);
    const href = safeHref(t.permalinkUrl);
    if (href) {
      children.push(el("a", { class: "permalink", href, target: "_blank", rel: "noopener", text: "View on X ↗" }));
    }
    return el("article", { class: "tweet" }, children);
  }

  async function renderFeed() {
    const list = document.getElementById("feedList");
    const tweets = await TWDB.getAllTweets();
    list.innerHTML = "";
    if (!tweets.length) {
      list.appendChild(
        el("div", { class: "empty" }, [
          el("div", { class: "big", text: "🗂️" }),
          el("div", { text: "No tweets saved yet. Head to the Import tab to bring in a feed export." }),
        ])
      );
      return;
    }
    tweets.forEach((t) => list.appendChild(buildTweetCard(t)));
  }

  // ---------- import flow ----------
  const fileInput = document.getElementById("fileInput");
  const progressWrap = document.getElementById("importProgress");
  const progressLabel = document.getElementById("progressLabel");
  const progressFill = document.getElementById("progressFill");

  function setProgress(pct, label) {
    progressWrap.style.display = "block";
    progressFill.style.width = pct + "%";
    progressLabel.textContent = label;
  }

  async function importFile(file) {
    let payload;
    try {
      const text = await file.text();
      payload = JSON.parse(text);
    } catch (e) {
      alert("That file isn't valid JSON exported by the bookmarklet.");
      return;
    }
    const tweets = Array.isArray(payload.tweets) ? payload.tweets : Array.isArray(payload) ? payload : null;
    if (!tweets) {
      alert("Couldn't find tweets in that file.");
      return;
    }

    setProgress(0, "Saving " + tweets.length + " tweets…");
    await TWDB.upsertTweets(tweets);

    const urls = new Set();
    tweets.forEach((t) => (t.media || []).forEach((m) => m.url && urls.add(m.url)));
    const urlList = Array.from(urls);

    let done = 0;
    let failed = 0;
    const concurrency = 4;
    let idx = 0;
    async function worker() {
      while (idx < urlList.length) {
        const url = urlList[idx++];
        const ok = await TWDB.cacheMedia(url);
        if (!ok) failed++;
        done++;
        setProgress(
          Math.round((done / urlList.length) * 100) || 100,
          "Caching media " + done + "/" + urlList.length + (failed ? " (" + failed + " failed)" : "")
        );
      }
    }
    if (urlList.length) {
      await Promise.all(Array.from({ length: Math.min(concurrency, urlList.length) }, worker));
    } else {
      setProgress(100, "Done");
    }

    setProgress(100, "Imported " + tweets.length + " tweets, cached " + (urlList.length - failed) + "/" + urlList.length + " media items.");
    fileInput.value = "";
    showView("feed");
  }

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importFile(file);
  });

  document.getElementById("openBookmarkletBtn").addEventListener("click", () => {
    window.location.href = "bookmarklet.html";
  });

  // ---------- settings ----------
  function fmtBytes(n) {
    if (n == null) return "—";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  async function renderSettings() {
    document.getElementById("statTweets").textContent = await TWDB.countTweets();
    document.getElementById("statMedia").textContent = await TWDB.countCachedMedia();
    document.getElementById("statUsage").textContent = fmtBytes(await TWDB.estimateUsage());
  }

  document.getElementById("clearBtn").addEventListener("click", async () => {
    if (!confirm("Delete all saved tweets and cached media from this device?")) return;
    await TWDB.clearAll();
    renderSettings();
    renderFeed();
  });

  // ---------- service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  // ---------- boot ----------
  showView("feed");
})();
