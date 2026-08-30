export function Skeleton({ width, height = 14 }: { width: number | string; height?: number }) {
  return <div className="skeleton" style={{ width, height }} />;
}

export function SkeletonPanel({ lines = 3 }: { lines?: number }) {
  return (
    <div className="panel">
      <Skeleton width={140} height={12} />
      <div style={{ height: 14 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <Skeleton width={i === lines - 1 ? "60%" : "100%"} />
        </div>
      ))}
    </div>
  );
}
