/* SkillTestBench project page — runtime
 *
 * Loads three JSON files from /data and renders:
 *   - the hero scatter (pass_rate_gain × safety_score)
 *   - the count-up stat strip
 *   - three real case studies
 *   - three distribution histograms
 *   - the interactive skill explorer (search / filter / sort)
 *
 * No build step. No framework. Just the platform.
 */
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

  const FEATURED_TONES = ["positive", "risky", "neutral"];
  const FEATURED_LABELS = ["Useful & clean", "Useful but risky", "No measured gain"];

  const SAFETY_BUCKET_TONES = [
    "danger", "danger", "danger", "danger", "warn",
    "warn",   "warn",   "",       "",       "",
  ];

  /* -------------------------------------------------------------- helpers */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class")        node.className = attrs[k];
        else if (k === "html")    node.innerHTML = attrs[k];
        else if (k === "text")    node.textContent = attrs[k];
        else if (k === "data") {
          Object.keys(attrs.data).forEach(function (dk) { node.dataset[dk] = attrs.data[dk]; });
        } else if (typeof attrs[k] === "boolean") {
          if (attrs[k]) node.setAttribute(k, "");
        } else {
          node.setAttribute(k, attrs[k]);
        }
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function fmtPercentPP(v, digits) {
    if (v == null || isNaN(v)) return "—";
    const sign = v > 0 ? "+" : "";
    return sign + (v * 100).toFixed(digits == null ? 1 : digits) + " pp";
  }

  function fmtFraction(v, digits) {
    if (v == null || isNaN(v)) return "—";
    return v.toFixed(digits == null ? 2 : digits);
  }

  function safetyClass(score) {
    if (score == null) return "";
    if (score >= 90) return "";
    if (score >= 65) return "mid";
    return "low";
  }

  function categoryLabel(id) {
    if (!id) return "—";
    return id
      .split("-")
      .map(function (s) { return s.charAt(0).toUpperCase() + s.slice(1); })
      .join(" ");
  }

  /* ---------------------------------------------------------------- fetch */

  function loadJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("fetch " + url + " => " + r.status);
      return r.json();
    });
  }

  /* ------------------------------------------------- 1. hero scatter plot */

  function renderHeroScatter(stats, featuredNames) {
    const wrap = document.getElementById("hero-scatter");
    if (!wrap) return;

    const featured = new Set(featuredNames || []);
    const padding = { top: 20, right: 16, bottom: 28, left: 36 };
    const w = 560;
    const h = 380;

    const svg = svgEl("svg", {
      class: "scatter-svg",
      viewBox: "0 0 " + w + " " + h,
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label": "Scatter plot of effectiveness gain vs safety score across all evaluated skills",
    });

    const x0 = padding.left;
    const x1 = w - padding.right;
    const y0 = padding.top;
    const y1 = h - padding.bottom;

    // grid + axis lines
    const grid = svgEl("g", { class: "scatter-grid" });
    [0.25, 0.5, 0.75].forEach(function (frac) {
      grid.appendChild(svgEl("line", { x1: x0, x2: x1, y1: y0 + (y1 - y0) * frac, y2: y0 + (y1 - y0) * frac }));
      grid.appendChild(svgEl("line", { x1: x0 + (x1 - x0) * frac, x2: x0 + (x1 - x0) * frac, y1: y0, y2: y1 }));
    });
    svg.appendChild(grid);

    const axes = svgEl("g", { class: "scatter-axis" });
    axes.appendChild(svgEl("line", { x1: x0, x2: x1, y1: y1, y2: y1 }));
    axes.appendChild(svgEl("line", { x1: x0, x2: x0, y1: y0, y2: y1 }));
    // x labels (effectiveness gain 0..1)
    [0, 0.25, 0.5, 0.75, 1.0].forEach(function (frac) {
      const x = x0 + (x1 - x0) * frac;
      const t = svgEl("text", { x: x, y: y1 + 16, "text-anchor": "middle" });
      t.textContent = (frac).toFixed(2);
      axes.appendChild(t);
    });
    // y labels (safety score 0..100, top -> 100)
    [100, 75, 50, 25, 0].forEach(function (val, i) {
      const y = y0 + ((y1 - y0) * i) / 4;
      const t = svgEl("text", { x: x0 - 6, y: y + 3, "text-anchor": "end" });
      t.textContent = String(val);
      axes.appendChild(t);
    });
    svg.appendChild(axes);

    // dots
    const dots = svgEl("g");
    const pts = stats.scatter || [];
    pts.forEach(function (p) {
      const xv = clamp(p.gain, 0, 1);
      const yv = clamp(p.safety, 0, 100) / 100;
      const cx = x0 + (x1 - x0) * xv;
      const cy = y1 - (y1 - y0) * yv;
      const isF = featured.has(p.name);
      const fill =
        p.safety < 50 ? "rgba(160, 69, 40, 0.78)" :
        p.safety < 80 ? "rgba(182, 115, 35, 0.76)" :
        p.gain >= 0.20 ? "rgba(13, 111, 105, 0.78)" :
                        "rgba(74, 110, 71, 0.55)";
      const circle = svgEl("circle", {
        class: "scatter-dot" + (isF ? " is-featured" : ""),
        cx: cx, cy: cy,
        r: isF ? 6.5 : 4.2,
        fill: fill,
        stroke: isF ? "#0e1c1f" : "rgba(14, 28, 31, 0.20)",
        "stroke-width": isF ? 1.4 : 0.8,
      });
      circle.dataset.name = p.name;
      circle.dataset.gain = p.gain;
      circle.dataset.safety = p.safety;
      circle.dataset.cat = p.category;
      dots.appendChild(circle);
    });
    svg.appendChild(dots);

    wrap.innerHTML = "";

    // legend block (header inside the panel)
    const legend = el("div", { class: "legend" }, [
      el("span", { class: "legend-title" }, "227 skills · effectiveness × safety"),
      el("span", { class: "legend-axes" }, [
        el("span", null, "x = effectiveness gain  ·  y = safety score"),
      ]),
    ]);
    wrap.appendChild(legend);
    wrap.appendChild(svg);

    // tooltip
    const tip = el("div", { class: "scatter-tooltip" });
    wrap.appendChild(tip);

    function showTip(circle) {
      tip.innerHTML = "";
      tip.appendChild(el("strong", null, circle.dataset.name));
      tip.appendChild(el("span", null, "gain " + fmtPercentPP(parseFloat(circle.dataset.gain)) + "  ·  safety " + parseFloat(circle.dataset.safety).toFixed(1)));
      tip.appendChild(el("span", null, categoryLabel(circle.dataset.cat)));
      tip.classList.add("show");

      // position relative to wrap
      const wrapRect = wrap.getBoundingClientRect();
      const dotRect = circle.getBoundingClientRect();
      tip.style.left = (dotRect.left - wrapRect.left + dotRect.width / 2) + "px";
      tip.style.top  = (dotRect.top  - wrapRect.top) + "px";
    }
    function hideTip() { tip.classList.remove("show"); }
    svg.addEventListener("mouseover", function (e) {
      if (e.target && e.target.classList && e.target.classList.contains("scatter-dot")) {
        showTip(e.target);
      }
    });
    svg.addEventListener("mouseout", function (e) {
      if (e.target && e.target.classList && e.target.classList.contains("scatter-dot")) {
        hideTip();
      }
    });
  }

  /* ------------------------------------------------- 2. count-up stat strip */

  function renderStats(stats) {
    const totals = stats.totals || {};
    const map = {
      "stat-skills":      { value: totals.skill_count, label: "Skills evaluated" },
      "stat-categories":  { value: totals.category_count, label: "Occupational categories" },
      "stat-scenarios":   { value: totals.scenario_count, label: "Generated scenarios" },
      "stat-judge-items": { value: totals.judge_items, label: "Judge items scored" },
      "stat-findings":    { value: totals.total_findings, label: "Security findings" },
    };
    Object.keys(map).forEach(function (id) {
      const slot = document.getElementById(id);
      if (!slot) return;
      const v = map[id].value;
      countUp(slot, 0, v || 0, 900);
    });
  }

  function countUp(node, from, to, duration) {
    const t0 = performance.now();
    function tick(t) {
      const k = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(from + (to - from) * eased);
      node.textContent = NUMBER_FORMAT.format(v);
      if (k < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ----------------------------------------------------- 3. case studies */

  function renderCaseStudies(featured) {
    const root = document.getElementById("bento");
    if (!root) return;
    root.innerHTML = "";

    featured.forEach(function (skill, i) {
      const tone = FEATURED_TONES[i] || "neutral";
      const label = FEATURED_LABELS[i] || "Case study";

      const card = el("article", { class: "case-study" });
      card.appendChild(el("span", { class: "case-tag is-" + tone }, label));
      card.appendChild(el("h3", null, skill.name));
      card.appendChild(el("div", { class: "case-meta" }, [
        document.createTextNode("Owner "),
        el("b", null, skill.owner || "—"),
        document.createTextNode("  ·  "),
        document.createTextNode(categoryLabel(skill.category)),
      ]));

      const u = skill.utility || {};
      const s = skill.safety || {};

      // Three metric cells
      const metrics = el("div", { class: "case-metrics" }, [
        metricCell("Effectiveness gain", fmtPercentPP(u.pass_rate_gain), gainDelta(u), gainTone(u.pass_rate_gain)),
        metricCell("Efficiency", fmtFraction(u.efficiency_score), effDelta(u), effTone(u.efficiency_score)),
        metricCell("Safety score", s.score == null ? "—" : Number(s.score).toFixed(1), findingsDelta(s), safetyTone(s.score)),
      ]);
      card.appendChild(metrics);

      if (i === 0) {
        // first case: judge-item evidence
        const judge = u.first_scenario_judge;
        if (judge && judge.items && judge.items.length) {
          card.appendChild(judgeBlock(judge));
        }
      }
      if (i === 1) {
        // second case: rich findings list
        if (s.findings && s.findings.length) {
          card.appendChild(findingsBlock(s));
        }
      }
      if (i === 2) {
        // third case: zero-gain explanation
        card.appendChild(zeroBlock(u, skill));
      }

      root.appendChild(card);
    });
  }

  function metricCell(lbl, val, delta, tone) {
    return el("div", { class: "metric-cell tone-" + tone }, [
      el("span", { class: "lbl" }, lbl),
      el("span", { class: "val" }, val),
      el("span", { class: "delta" }, delta),
    ]);
  }

  function gainTone(v) {
    if (v == null || isNaN(v)) return "neutral";
    if (v >= 0.20) return "positive";
    if (v <= 0)    return "neutral";
    return "amber";
  }
  function effTone(v) {
    if (v == null || isNaN(v)) return "neutral";
    if (v >= 0.30) return "positive";
    if (v <= 0)    return "neutral";
    return "amber";
  }
  function safetyTone(v) {
    if (v == null) return "neutral";
    if (v >= 90)   return "positive";
    if (v >= 65)   return "amber";
    return "risky";
  }

  function gainDelta(u) {
    if (!u || u.total_items == null) return "";
    return "wi " + (u.wi_passed_items || 0) + " / wo " + (u.wo_passed_items || 0) + "  ·  " + u.total_items + " items";
  }
  function effDelta(u) {
    if (!u) return "";
    return "from time + token savings";
  }
  function findingsDelta(s) {
    if (!s || !s.findings) return "from 100 baseline";
    const triggered = (s.findings || []).filter(function (f) { return f.risk_triggered === true; }).length;
    return triggered + " of " + s.findings.length + " confirmed triggered";
  }

  function judgeBlock(judge) {
    const wrap = el("div", { class: "case-judge" });
    wrap.appendChild(el("h4", null, "Scenario " + judge.scenario_id + ":  judge evidence  (" + judge.wi_passed + " / " + judge.total_items + " with skill,  " + judge.wo_passed + " / " + judge.total_items + " without)"));

    judge.items.slice(0, 3).forEach(function (item) {
      const block = el("div", { class: "judge-item" });
      block.appendChild(el("p", { class: "judge-criterion" }, "[" + item.item_id + "] " + item.criterion));

      // wi row
      const wiRow = el("div", { class: "judge-row " + (item.wi_score === 1 ? "pass" : "fail") }, [
        el("span", { class: "badge wi" }, "wi " + (item.wi_score === 1 ? "✓" : "✗")),
        el("p", null, item.wi_reason || ""),
      ]);
      block.appendChild(wiRow);

      // wo row
      const woRow = el("div", { class: "judge-row " + (item.wo_score === 1 ? "pass" : "fail") }, [
        el("span", { class: "badge wo" }, "wo " + (item.wo_score === 1 ? "✓" : "✗")),
        el("p", null, item.wo_reason || ""),
      ]);
      block.appendChild(woRow);

      wrap.appendChild(block);
    });

    return wrap;
  }

  function findingsBlock(s) {
    const wrap = el("div", { class: "findings-list" });
    (s.findings || []).slice(0, 5).forEach(function (f) {
      const item = el("div", { class: "finding" });

      // head
      const head = el("div", { class: "finding-head" });
      head.appendChild(el("div", { class: "id-sev" }, [
        el("span", { class: "id" }, f.finding_id),
        el("span", { class: "sev " + (f.severity || "L").toLowerCase() }, f.severity || "—"),
      ]));
      head.appendChild(el("span", {
        class: "verdict" + (f.trigger_verdict === "confirmed" ? " confirmed" : ""),
      }, (f.trigger_verdict || "—").replace(/_/g, " ")));
      item.appendChild(head);

      // pattern
      item.appendChild(el("div", { class: "finding-pattern" }, [
        document.createTextNode(f.pattern_name || "—"),
        f.category ? el("span", { class: "cat" }, "  ·  " + f.category) : null,
      ]));

      // rationale
      if (f.rationale) {
        item.appendChild(el("p", { class: "rationale" }, f.rationale));
      }

      // bars
      const bars = el("div", { class: "finding-bars" });
      bars.appendChild(barCell("Existence", f.existence_confidence, ""));
      bars.appendChild(barCell("Exploitability", f.exploitability, "exploit"));
      item.appendChild(bars);

      wrap.appendChild(item);
    });
    return wrap;
  }

  function barCell(lbl, val, mod) {
    const pct = (val == null) ? 0 : clamp(val, 0, 1) * 100;
    return el("div", { class: "bar-cell " + mod }, [
      el("span", { class: "lab" }, lbl),
      el("span", { class: "track" }, [
        el("span", { class: "fill", style: "width:" + pct + "%" }),
      ]),
      el("span", { class: "num" }, val == null ? "—" : val.toFixed(2)),
    ]);
  }

  function zeroBlock(u, skill) {
    const text = (
      "Across " + (u.scenarios ? u.scenarios.length : 0) + " scenarios, the agent passed " +
      (u.wi_passed_items || 0) + " of " + (u.total_items || 0) + " judge items with the skill mounted " +
      "and " + (u.wo_passed_items || 0) + " of " + (u.total_items || 0) + " without. The skill's effectiveness gain " +
      "rounds to zero — a useful counter-example for adoption decisions."
    );
    return el("div", { class: "case-zero" }, [
      el("strong", null, "Why this skill is here. "),
      document.createTextNode(text),
    ]);
  }

  /* ------------------------------------------------- 4. distribution charts */

  function renderDistributions(stats) {
    drawHistogram("dist-gain",   stats.distributions.pass_rate_gain,   { color: "bucket",         labelMax: "1.0",  labelStart: "0", footTotal: stats.totals.valid_with_gain });
    drawHistogram("dist-eff",    stats.distributions.efficiency_score, { color: "bucket eff",     labelMax: "1.0",  labelStart: "0", footTotal: stats.totals.skill_count });
    drawHistogram("dist-safety", stats.distributions.safety_score,     { color: "bucket safety", labelMax: "100", labelStart: "0", safetyMode: true, footTotal: stats.totals.skill_count });
  }

  function drawHistogram(id, dist, opts) {
    const slot = document.getElementById(id);
    if (!slot || !dist) return;
    slot.innerHTML = "";

    const buckets = dist.buckets || [];
    const padding = { top: 8, right: 6, bottom: 22, left: 6 };
    const w = 360;
    const h = 160;
    const innerW = w - padding.left - padding.right;
    const innerH = h - padding.top - padding.bottom;
    const maxCount = Math.max.apply(null, buckets.concat([1]));

    const svg = svgEl("svg", {
      class: "dist-svg",
      viewBox: "0 0 " + w + " " + h,
      preserveAspectRatio: "xMidYMid meet",
      "aria-label": "Histogram",
    });

    const bw = innerW / buckets.length;
    buckets.forEach(function (count, i) {
      const x = padding.left + i * bw + 1;
      const bh = (count / maxCount) * innerH;
      const y = padding.top + innerH - bh;
      let cls = "bucket";
      if (opts.color) cls = opts.color;
      if (opts.safetyMode && SAFETY_BUCKET_TONES[i]) cls = "bucket safety " + SAFETY_BUCKET_TONES[i];
      const rect = svgEl("rect", {
        class: cls,
        x: x.toString(),
        y: y.toString(),
        width: (bw - 2).toString(),
        height: bh.toString(),
        rx: "2",
      });
      svg.appendChild(rect);

      // count label inside the bar (if tall enough)
      if (bh > 22 && count > 0) {
        const t = svgEl("text", {
          x: (x + (bw - 2) / 2).toString(),
          y: (y + 14).toString(),
          "text-anchor": "middle",
          "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
          "font-size": "10",
          fill: "rgba(255,255,255,0.92)",
          "font-weight": "700",
        });
        t.textContent = String(count);
        svg.appendChild(t);
      }
    });

    // x axis labels
    const axis = svgEl("g", { class: "axis" });
    const ax0 = padding.left;
    const ax1 = padding.left + innerW;
    const ay = padding.top + innerH + 1;
    axis.appendChild(svgEl("line", { x1: ax0.toString(), x2: ax1.toString(), y1: ay.toString(), y2: ay.toString() }));
    [opts.labelStart, opts.labelMax].forEach(function (txt, i) {
      const t = svgEl("text", {
        x: (i === 0 ? ax0 : ax1).toString(),
        y: (ay + 14).toString(),
        "text-anchor": i === 0 ? "start" : "end",
      });
      t.textContent = txt;
      axis.appendChild(t);
    });
    svg.appendChild(axis);

    slot.appendChild(svg);
  }

  /* ----------------------------------------------- 5. interactive explorer */

  const STATE = {
    skills: [],
    sortKey: "gain",
    sortDir: -1,        // -1 desc, +1 asc
    category: "",
    query: "",
    pageSize: 20,
    page: 1,
  };

  const SORTERS = {
    name:    function (a, b) { return a.name.localeCompare(b.name); },
    gain:    function (a, b) { return ((a.pass_rate_gain || 0) - (b.pass_rate_gain || 0)); },
    eff:     function (a, b) { return ((a.efficiency_score || 0) - (b.efficiency_score || 0)); },
    safety:  function (a, b) { return ((a.safety_score || 0) - (b.safety_score || 0)); },
    findings:function (a, b) { return ((a.findings || {}).total || 0) - ((b.findings || {}).total || 0); },
  };

  function setupExplorer(idx, stats) {
    STATE.skills = idx.skills || [];

    // populate category filter
    const sel = document.getElementById("explorer-category");
    if (sel) {
      sel.innerHTML = "";
      sel.appendChild(el("option", { value: "" }, "All categories  (" + STATE.skills.length + ")"));
      (stats.categories || []).forEach(function (c) {
        sel.appendChild(el("option", { value: c.id }, c.label + "  (" + c.count + ")"));
      });
      sel.addEventListener("change", function () { STATE.category = sel.value; STATE.page = 1; renderExplorer(); });
    }

    // search
    const search = document.getElementById("explorer-search");
    if (search) {
      search.addEventListener("input", function () {
        STATE.query = search.value.trim().toLowerCase();
        STATE.page = 1;
        renderExplorer();
      });
    }

    // sort
    $$(".explorer-table th[data-sort]").forEach(function (th) {
      th.addEventListener("click", function () {
        const key = th.dataset.sort;
        if (STATE.sortKey === key) STATE.sortDir = -STATE.sortDir;
        else { STATE.sortKey = key; STATE.sortDir = (key === "name" ? 1 : -1); }
        renderExplorer();
      });
    });

    // pagination
    const prev = document.getElementById("explorer-prev");
    const next = document.getElementById("explorer-next");
    if (prev) prev.addEventListener("click", function () { if (STATE.page > 1) { STATE.page -= 1; renderExplorer(); } });
    if (next) next.addEventListener("click", function () { STATE.page += 1; renderExplorer(); });

    renderExplorer();
  }

  function filteredSkills() {
    const q = STATE.query;
    const cat = STATE.category;
    return STATE.skills.filter(function (s) {
      if (cat && s.category !== cat) return false;
      if (!q) return true;
      return s.name.toLowerCase().indexOf(q) !== -1
          || (s.owner || "").toLowerCase().indexOf(q) !== -1
          || (s.category || "").toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderExplorer() {
    const tbody = document.getElementById("explorer-body");
    if (!tbody) return;

    const sorter = SORTERS[STATE.sortKey] || SORTERS.gain;
    const dir = STATE.sortDir;
    const list = filteredSkills().slice().sort(function (a, b) { return dir * sorter(a, b); });

    // sort marks
    $$(".explorer-table th[data-sort]").forEach(function (th) {
      th.classList.toggle("is-sorted", th.dataset.sort === STATE.sortKey);
      const mark = th.querySelector(".sort-mark");
      if (mark) mark.textContent = (th.dataset.sort === STATE.sortKey) ? (dir === 1 ? "▲" : "▼") : "—";
    });

    // pagination clamp
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / STATE.pageSize));
    if (STATE.page > pages) STATE.page = pages;
    const start = (STATE.page - 1) * STATE.pageSize;
    const view = list.slice(start, start + STATE.pageSize);

    tbody.innerHTML = "";
    if (view.length === 0) {
      tbody.appendChild(el("tr", null, [
        el("td", { colspan: "5", class: "explorer-empty" }, "No skills match the current filter."),
      ]));
    } else {
      view.forEach(function (s) {
        tbody.appendChild(renderExplorerRow(s));
      });
    }

    const meta = document.getElementById("explorer-meta");
    if (meta) {
      meta.innerHTML = "";
      meta.appendChild(el("span", null, [
        document.createTextNode("Showing "),
        el("strong", null, (start + 1) + "–" + Math.min(total, start + view.length)),
        document.createTextNode(" of "),
        el("strong", null, String(total)),
        document.createTextNode(" matching skills"),
      ]));
      meta.appendChild(el("span", null, [
        document.createTextNode("Sort by  "),
        el("strong", null, STATE.sortKey),
        document.createTextNode("  (" + (dir === 1 ? "ascending" : "descending") + ")"),
      ]));
    }

    const prev = document.getElementById("explorer-prev");
    const next = document.getElementById("explorer-next");
    const pageL = document.getElementById("explorer-page");
    if (pageL) pageL.textContent = "page  " + STATE.page + " / " + pages;
    if (prev) prev.disabled = STATE.page <= 1;
    if (next) next.disabled = STATE.page >= pages;
  }

  function renderExplorerRow(s) {
    const tr = el("tr");

    // skill
    tr.appendChild(el("td", null, [
      el("span", { class: "skill-name" }, [
        document.createTextNode(s.name),
        el("small", null, s.owner || "unknown"),
      ]),
    ]));

    // category
    tr.appendChild(el("td", { class: "col-cat" }, [
      el("span", { class: "cat-pill" }, categoryLabel(s.category)),
    ]));

    // gain
    const gv = s.pass_rate_gain;
    const gPct = (gv == null) ? 0 : clamp(gv, 0, 1) * 100;
    tr.appendChild(el("td", { class: "num" }, [
      el("span", { class: "bar-inline" + (gv === 0 ? " is-zero" : "") }, [
        el("span", { class: "track" }, el("span", { class: "fill", style: "width:" + gPct + "%" })),
        el("span", { class: "num" }, gv == null ? "—" : fmtPercentPP(gv)),
      ]),
    ]));

    // efficiency
    const ev = s.efficiency_score;
    const ePct = (ev == null) ? 0 : clamp(ev, 0, 1) * 100;
    tr.appendChild(el("td", { class: "num col-eff" }, [
      el("span", { class: "bar-inline is-eff" + (ev === 0 ? " is-zero" : "") }, [
        el("span", { class: "track" }, el("span", { class: "fill", style: "width:" + ePct + "%" })),
        el("span", { class: "num" }, ev == null ? "—" : fmtFraction(ev)),
      ]),
    ]));

    // safety
    const sv = s.safety_score;
    tr.appendChild(el("td", { class: "num" }, [
      el("span", { class: "safety-pill " + safetyClass(sv) }, sv == null ? "—" : sv.toFixed(1)),
      document.createTextNode("  "),
      el("span", { class: "findings-pills" }, [
        el("span", { class: "p h" + ((s.findings || {}).H ? "" : " zero") }, "H " + ((s.findings || {}).H || 0)),
        el("span", { class: "p m" + ((s.findings || {}).M ? "" : " zero") }, "M " + ((s.findings || {}).M || 0)),
        el("span", { class: "p l" + ((s.findings || {}).L ? "" : " zero") }, "L " + ((s.findings || {}).L || 0)),
      ]),
    ]));

    return tr;
  }

  /* ------------------------------------------------- 6. reveal on scroll */

  function setupReveal() {
    const items = $$(".reveal");
    if (!items.length || !("IntersectionObserver" in window)) {
      items.forEach(function (i) { i.classList.add("is-visible"); });
      return;
    }
    const obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); obs.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.05 });
    items.forEach(function (i) { obs.observe(i); });
  }

  /* ------------------------------------------------- 7. nav active state */

  function setupNavActive() {
    const links = $$(".topnav a[href^='#']");
    if (!links.length || !("IntersectionObserver" in window)) return;
    const map = {};
    links.forEach(function (a) {
      const id = a.getAttribute("href").slice(1);
      const el = document.getElementById(id);
      if (el) map[id] = a;
    });
    const obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        Object.keys(map).forEach(function (k) { map[k].classList.remove("is-active"); });
        if (map[e.target.id]) map[e.target.id].classList.add("is-active");
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    Object.keys(map).forEach(function (id) { obs.observe(document.getElementById(id)); });
  }

  /* --------------------------------------------------- 8. copy bibtex */

  function setupCopy() {
    const btn = document.getElementById("copy-bib");
    const pre = document.getElementById("bibtex");
    if (!btn || !pre) return;
    btn.addEventListener("click", function () {
      const text = pre.textContent || "";
      const done = function () {
        btn.textContent = "Copied to clipboard";
        btn.classList.add("is-copied");
        setTimeout(function () {
          btn.textContent = "Copy BibTeX";
          btn.classList.remove("is-copied");
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(done);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (e) { /* noop */ }
        document.body.removeChild(ta);
        done();
      }
    });
  }

  /* --------------------------------------------------------------- boot */

  function bootError(message) {
    const slots = ["hero-scatter", "bento", "explorer-body"];
    slots.forEach(function (id) {
      const n = document.getElementById(id);
      if (n) n.textContent = message;
    });
  }

  Promise.all([
    loadJson("data/skills.json"),
    loadJson("data/stats.json"),
    loadJson("data/featured.json"),
  ]).then(function (results) {
    const idx = results[0];
    const stats = results[1];
    const featured = results[2];

    const featuredNames = (featured || []).map(function (f) { return f.name; });

    renderHeroScatter(stats, featuredNames);
    renderStats(stats);
    renderCaseStudies(featured);
    renderDistributions(stats);
    setupExplorer(idx, stats);
    setupReveal();
    setupNavActive();
    setupCopy();
  }).catch(function (err) {
    console.error("[skilltestbench] boot failed", err);
    bootError("Could not load evaluation data. Run the page from a server (file:// blocks fetch on JSON).");
  });
})();
