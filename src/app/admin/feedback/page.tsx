"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./feedback-admin.module.css";

type FeedbackCategory = "bug" | "idea" | "chat";
type CategoryFilter = FeedbackCategory | "all";
type RatingFilter = "all" | "1" | "2" | "3" | "4" | "5";

type FeedbackItem = {
  id: string;
  created_at: string;
  rating: number;
  category: FeedbackCategory;
  content: string;
  page: string;
};

type FeedbackBreakdown = {
  averageRating: number | null;
  category: FeedbackCategory;
  count: number;
};

type FeedbackAdminResponse = {
  breakdown: FeedbackBreakdown[];
  items: FeedbackItem[];
  limit: number;
  summary: {
    averageRating: number | null;
    total: number;
  };
};

type AnalyticsDay = {
  date: string;
  pageViews: number;
  requests: number;
  uniqueVisitors: number;
};

type AnalyticsResponse = {
  days: AnalyticsDay[];
  latest: AnalyticsDay | null;
  range: {
    endDate: string;
    startDate: string;
  };
  totals: {
    pageViews: number;
    requests: number;
    uniqueVisitors: number;
  };
};

const TOKEN_STORAGE_KEY = "feedback-admin-token";
const RATINGS: RatingFilter[] = ["all", "1", "2", "3", "4", "5"];
const CATEGORIES: Array<{ id: CategoryFilter; label: string }> = [
  { id: "all", label: "全部类型" },
  { id: "bug", label: "BUG反馈" },
  { id: "idea", label: "贡献想法" },
  { id: "chat", label: "和作者聊天" },
];
const CATEGORY_LABELS = {
  bug: "BUG反馈",
  chat: "和作者聊天",
  idea: "贡献想法",
} as const satisfies Record<FeedbackCategory, string>;

function getAdminApiUrl(path = "") {
  const route = `/api/feedback/admin${path}`;
  if (typeof window === "undefined") return route;
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `https://208848.xyz${route}`;
  }
  return route;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
  });
}

function formatDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function formatAverage(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "-";
}

function formatCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("zh-CN") : "-";
}

export default function FeedbackAdminPage() {
  const [tokenInput, setTokenInput] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [feedbackData, setFeedbackData] = useState<FeedbackAdminResponse | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [analyticsStatus, setAnalyticsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [analyticsError, setAnalyticsError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
      setAdminToken(savedToken);
      setTokenInput(savedToken);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const categoryTotals = useMemo(() => {
    const totals = new Map<FeedbackCategory, FeedbackBreakdown>();
    for (const item of feedbackData?.breakdown ?? []) totals.set(item.category, item);
    return totals;
  }, [feedbackData]);

  const maxDailyVisitors = useMemo(
    () => Math.max(1, ...(analyticsData?.days.map((item) => item.uniqueVisitors) ?? [0])),
    [analyticsData],
  );

  const loadFeedback = useCallback(async () => {
    const token = adminToken.trim();
    if (!token) {
      setStatus("idle");
      setFeedbackData(null);
      return;
    }

    const params = new URLSearchParams();
    if (ratingFilter !== "all") params.set("rating", ratingFilter);
    if (categoryFilter !== "all") params.set("category", categoryFilter);

    setStatus("loading");
    setError("");
    try {
      const query = params.toString();
      const response = await fetch(`${getAdminApiUrl()}${query ? `?${query}` : ""}`, {
        cache: "no-store",
        headers: {
          "x-admin-token": token,
        },
      });
      if (response.status === 401) throw new Error("管理员密钥不对。");
      if (response.status === 503) throw new Error("后台密钥还没在 Worker 里配置。");
      if (!response.ok) throw new Error("读取反馈失败。");

      const data = (await response.json()) as FeedbackAdminResponse;
      setFeedbackData(data);
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取反馈失败。");
      setStatus("error");
    }
  }, [adminToken, categoryFilter, ratingFilter]);

  const loadAnalytics = useCallback(async () => {
    const token = adminToken.trim();
    if (!token) {
      setAnalyticsStatus("idle");
      setAnalyticsData(null);
      return;
    }

    setAnalyticsStatus("loading");
    setAnalyticsError("");
    try {
      const response = await fetch(getAdminApiUrl("/analytics"), {
        cache: "no-store",
        headers: {
          "x-admin-token": token,
        },
      });
      if (response.status === 401) throw new Error("管理员密钥不对。");
      if (response.status === 503) throw new Error("Cloudflare Analytics Token 还没配置。");
      if (!response.ok) throw new Error("读取访问数据失败。");

      const data = (await response.json()) as AnalyticsResponse;
      setAnalyticsData(data);
      setAnalyticsStatus("ready");
    } catch (caught) {
      setAnalyticsError(caught instanceof Error ? caught.message : "读取访问数据失败。");
      setAnalyticsStatus("error");
    }
  }, [adminToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFeedback();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadFeedback]);

  const saveToken = useCallback(() => {
    const nextToken = tokenInput.trim();
    window.localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    setAdminToken(nextToken);
  }, [tokenInput]);

  const clearToken = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setAdminToken("");
    setTokenInput("");
    setFeedbackData(null);
    setAnalyticsData(null);
    setStatus("idle");
    setAnalyticsStatus("idle");
  }, []);

  const summary = feedbackData?.summary;
  const items = feedbackData?.items ?? [];
  const latestAnalytics = analyticsData?.latest;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Cloudflare D1 + Analytics</p>
          <h1>反馈后台</h1>
          <p>按评分和类型查看玩家反馈，访问数据只在手动刷新时读取。</p>
        </div>
        <button className={styles.refreshButton} disabled={!adminToken || status === "loading"} onClick={() => void loadFeedback()} type="button">
          {status === "loading" ? "读取中" : "刷新反馈"}
        </button>
      </section>

      <section className={styles.authBar} aria-label="管理员密钥">
        <label>
          <span>管理员密钥</span>
          <input
            autoComplete="current-password"
            onChange={(event) => setTokenInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveToken();
            }}
            placeholder="输入后台密钥"
            type="password"
            value={tokenInput}
          />
        </label>
        <button onClick={saveToken} type="button">保存密钥</button>
        {adminToken ? <button className={styles.secondaryButton} onClick={clearToken} type="button">清除</button> : null}
      </section>

      <section className={styles.dashboard} aria-label="反馈概览">
        <div className={styles.metric}>
          <span>总反馈</span>
          <strong>{summary?.total ?? "-"}</strong>
        </div>
        <div className={styles.metric}>
          <span>平均评分</span>
          <strong>{formatAverage(summary?.averageRating)}</strong>
        </div>
        {(["bug", "idea", "chat"] as const).map((category) => {
          const total = categoryTotals.get(category);
          return (
            <div className={styles.metric} key={category}>
              <span>{CATEGORY_LABELS[category]}</span>
              <strong>{total?.count ?? 0}</strong>
            </div>
          );
        })}
      </section>

      <section className={styles.analyticsPanel} aria-label="访问概览">
        <header>
          <div>
            <span className={styles.filterLabel}>访问概览</span>
            <h2>Cloudflare 近7天</h2>
          </div>
          <button disabled={!adminToken || analyticsStatus === "loading"} onClick={() => void loadAnalytics()} type="button">
            {analyticsStatus === "loading" ? "读取中" : "刷新访问数据"}
          </button>
        </header>

        <div className={styles.analyticsMetrics}>
          <div>
            <span>近7天访客</span>
            <strong>{formatCount(analyticsData?.totals.uniqueVisitors)}</strong>
            <small>按每日独立访客相加</small>
          </div>
          <div>
            <span>最新一天访客</span>
            <strong>{formatCount(latestAnalytics?.uniqueVisitors)}</strong>
            <small>{latestAnalytics ? formatDay(latestAnalytics.date) : "未刷新"}</small>
          </div>
          <div>
            <span>近7天浏览量</span>
            <strong>{formatCount(analyticsData?.totals.pageViews)}</strong>
            <small>Cloudflare page views</small>
          </div>
          <div>
            <span>近7天请求</span>
            <strong>{formatCount(analyticsData?.totals.requests)}</strong>
            <small>含资源请求</small>
          </div>
        </div>

        {analyticsError ? <p className={styles.error}>{analyticsError}</p> : null}

        <div className={styles.analyticsBars}>
          {(analyticsData?.days ?? []).map((day) => (
            <div className={styles.analyticsBar} key={day.date}>
              <span>{formatDay(day.date)}</span>
              <div>
                <i style={{ inlineSize: `${Math.max(8, (day.uniqueVisitors / maxDailyVisitors) * 100)}%` }} />
              </div>
              <strong>{formatCount(day.uniqueVisitors)}</strong>
            </div>
          ))}
          {!analyticsData && !analyticsError ? <p>点击“刷新访问数据”后显示，不会自动消耗查询。</p> : null}
        </div>
      </section>

      <section className={styles.filters} aria-label="筛选反馈">
        <div>
          <span className={styles.filterLabel}>评分</span>
          <div className={styles.segmented}>
            {RATINGS.map((rating) => (
              <button
                className={ratingFilter === rating ? styles.selected : ""}
                key={rating}
                onClick={() => setRatingFilter(rating)}
                type="button"
              >
                {rating === "all" ? "全部评分" : rating}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={styles.filterLabel}>类型</span>
          <div className={styles.segmented}>
            {CATEGORIES.map((category) => (
              <button
                className={categoryFilter === category.id ? styles.selected : ""}
                key={category.id}
                onClick={() => setCategoryFilter(category.id)}
                type="button"
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.feedbackList} aria-label="反馈列表">
        {items.length === 0 ? (
          <div className={styles.empty}>{adminToken ? "暂无符合条件的反馈。" : "先输入管理员密钥。"}</div>
        ) : (
          items.map((item) => (
            <article className={styles.feedbackItem} key={item.id}>
              <header>
                <div>
                  <strong>{item.rating}</strong>
                  <span>分</span>
                </div>
                <p>{CATEGORY_LABELS[item.category]}</p>
                <time dateTime={item.created_at}>{formatDate(item.created_at)}</time>
              </header>
              <p className={styles.content}>{item.content}</p>
              <footer>
                <span>{item.page}</span>
                <code>{item.id.slice(0, 8)}</code>
              </footer>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
