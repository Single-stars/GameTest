export function RadarChart({ axis }: { axis: { label: string; score: number }[] }) {
  const center = 120;
  const radius = 78;
  const angleFor = (index: number) => -Math.PI / 2 + (index / axis.length) * Math.PI * 2;
  const point = (index: number, scale: number) => {
    const angle = angleFor(index);
    return {
      x: center + Math.cos(angle) * radius * scale,
      y: center + Math.sin(angle) * radius * scale,
    };
  };
  const polygon = axis
    .map((item, index) => {
      const current = point(index, item.score / 100);
      return `${current.x},${current.y}`;
    })
    .join(" ");
  const labelScaleFor = (label: string) => (label === "控制力" || label === "连续反应" || label === "手眼协调" || label === "时机判断" ? 1.34 : 1.2);

  return (
    <section className="radar-card" aria-label="八向能力图">
      <div className="radar-visual">
        <svg viewBox="0 0 240 240" role="img" aria-label="八项评分雷达图">
          {[0.25, 0.5, 0.75, 1].map((scale) => (
            <polygon
              className="radar-ring"
              key={scale}
              points={axis
                .map((_, index) => {
                  const current = point(index, scale);
                  return `${current.x},${current.y}`;
                })
                .join(" ")}
            />
          ))}
          {axis.map((_, index) => {
            const outer = point(index, 1);
            return <line className="radar-axis" key={index} x1={center} y1={center} x2={outer.x} y2={outer.y} />;
          })}
          <polygon className="radar-score" points={polygon} />
          {axis.map((item, index) => {
            const labelPoint = point(index, labelScaleFor(item.label));
            return (
              <text className="radar-label" key={item.label} x={labelPoint.x} y={labelPoint.y}>
                {item.label}
              </text>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
