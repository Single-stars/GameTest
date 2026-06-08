type ConfirmDialogProps = { onCancel: () => void; onConfirm: () => void };

export function RestartConfirmDialog({ onCancel, onConfirm }: ConfirmDialogProps) {
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

export function AppExitConfirmDialog({ onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <div className="restart-dialog-backdrop" role="presentation" onPointerDown={(event) => event.stopPropagation()}>
      <section
        aria-labelledby="app-exit-dialog-title"
        aria-modal="true"
        className="restart-dialog"
        role="dialog"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">退出游戏</p>
        <h2 id="app-exit-dialog-title">确认退出游戏？</h2>
        <p>再次确认后会离开当前页面；已保存的进度会保留。</p>
        <div className="restart-dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            继续游戏
          </button>
          <button className="primary-button" type="button" onClick={onConfirm}>
            退出游戏
          </button>
        </div>
      </section>
    </div>
  );
}
