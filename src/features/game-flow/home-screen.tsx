"use client";

import { useEffect, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ShareIcon } from "@/features/results/result-icons";

const DISCLAIMER_ITEMS = [
  "本测试仅供娱乐，不是专业能力、心理、医疗、教育或职业评估。",
  "测试结果只代表本次浏览器操作表现。",
  "本地会使用 localStorage 保存结果、进度、皮肤等数据。",
  "分享图片在本机浏览器生成。",
  "反馈功能会提交反馈文本、评分、反馈类型、页面信息和浏览器 user-agent，用于排查问题和改进体验。",
  "请勿在反馈中填写手机号、微信、真实姓名、身份证、地址等敏感信息。",
  "开始测试即代表确认以上说明。",
] as const;

export function HomeScreen({
  consentAccepted,
  onConsentChange,
  onShareImage,
  onStart,
  title,
}: {
  consentAccepted: boolean;
  onConsentChange: (accepted: boolean) => void;
  onShareImage: () => void;
  onStart: () => void;
  title: string;
}) {
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [consentWarningId, setConsentWarningId] = useState(0);

  useEffect(() => {
    if (consentWarningId === 0) return undefined;
    const timer = window.setTimeout(() => setConsentWarningId(0), 1800);
    return () => window.clearTimeout(timer);
  }, [consentWarningId]);

  const updateConsent = (accepted: boolean) => {
    onConsentChange(accepted);
    if (accepted) setConsentWarningId(0);
  };

  const handleStart = () => {
    if (!consentAccepted) {
      setConsentWarningId((current) => current + 1);
      return;
    }
    setConsentWarningId(0);
    onStart();
  };

  const handleStartPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    handleStart();
  };

  const handleStartKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleStart();
  };

  if (disclaimerOpen) {
    return (
      <section className="home-screen home-disclaimer-screen" aria-labelledby="home-disclaimer-title">
        <button className="secondary-button home-disclaimer-back" type="button" onClick={() => setDisclaimerOpen(false)}>
          返回
        </button>
        <article className="home-disclaimer-card">
          <h1 id="home-disclaimer-title">隐私与免责声明</h1>
          <ul>
            {DISCLAIMER_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    );
  }

  return (
    <section className="home-screen">
      <button aria-label="生成默认分享图片" className="icon-button home-image-button" type="button" onPointerDown={onShareImage}>
        <ShareIcon />
      </button>
      <div className="home-main">
        <div className="hero-copy compact">
          <h1>{title}</h1>
        </div>
        <button
          aria-describedby={consentWarningId > 0 ? "home-consent-toast" : undefined}
          className="primary-button hero-button"
          data-consent-ready={consentAccepted ? "true" : "false"}
          type="button"
          onKeyDown={handleStartKeyDown}
          onPointerDown={handleStartPointerDown}
        >
          开始
        </button>
      </div>
      <section className="home-consent-panel" aria-label="隐私与免责声明确认">
        <div className="home-consent-row">
          <label className="home-consent-check">
            <input type="checkbox" checked={consentAccepted} onChange={(event) => updateConsent(event.currentTarget.checked)} />
            <span>我已阅读并同意</span>
          </label>
          <button className="home-disclaimer-link" type="button" onClick={() => setDisclaimerOpen(true)}>
            隐私与免责声明
          </button>
        </div>
      </section>
      {consentWarningId > 0 ? (
        <div id="home-consent-toast" className="home-consent-toast" key={consentWarningId} role="alert">
          请先勾选隐私与免责声明
        </div>
      ) : null}
    </section>
  );
}
