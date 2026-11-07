import { useState } from "react";

export function Art({
  art,
  emoji,
  image,
  className = "",
  style,
  glyphSize,
}: {
  art: string;
  emoji: string;
  image?: string;
  className?: string;
  style?: React.CSSProperties;
  glyphSize?: number;
}) {
  const [broken, setBroken] = useState(false);
  const showImage = !!image && !broken;
  return (
    <div className={`art ${art} ${className}`} style={style}>
      {showImage ? (
        <>
          <img src={image} alt="" loading="lazy" onError={() => setBroken(true)} />
          <div
            className="glyph"
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              opacity: 0,
            }}
          >
            {emoji}
          </div>
        </>
      ) : (
        <div className="glyph" style={glyphSize ? { fontSize: glyphSize } : undefined}>
          {emoji}
        </div>
      )}
    </div>
  );
}
