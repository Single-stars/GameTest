export function RestartConfirmDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="restart-dialog-backdrop" role="presentation" onPointerDown={(event) => event.stopPropagation()}>
      <section
        aria-labelledby="restart-dialog-title"
        aria-modal="true"
        className="restart-dialog"
        role="dialog"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">重新测试</p>
        <h2 id="restart-dialog-title">清空当前结果？</h2>
        <p>当前结果页会重置，已完成的进阶、运气星和抽取次数都会保留。</p>
        <div className="restart-dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            先保留
          </button>
          <button className="primary-button" type="button" onClick={onConfirm}>
            重新测试
          </button>
        </div>
      </section>
    </div>
  );
}
