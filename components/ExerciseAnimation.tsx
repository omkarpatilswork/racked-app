// Ported 1:1 from the Racked Artifact prototype (Round 3's "looks like an
// actual person" rebuild) — filled capsule limbs + a torso "shirt" shape,
// animated by rotating a pivoted <g> via the CSS keyframes in globals.css.

function SvgWrap({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 160 160" aria-hidden="true" style={{ width: "100%", height: "100%" }}>
      {children}
    </svg>
  );
}

function SeatedArmFigure({
  armAnim,
  torsoAnim,
}: {
  armAnim: string;
  torsoAnim?: string;
}) {
  const torsoStyle: React.CSSProperties = torsoAnim
    ? { transformOrigin: "55px 118px", animation: `${torsoAnim} 2.6s ease-in-out infinite` }
    : {};
  return (
    <SvgWrap>
      <ellipse className="figure-shadow" cx={56} cy={151} rx={34} ry={6} />
      <line className="figure-rig" x1={14} y1={132} x2={98} y2={132} />
      <line className="figure-rig" x1={50} y1={132} x2={50} y2={148} />
      <line className="figure-limb-thigh" x1={55} y1={118} x2={62} y2={150} />
      <g style={torsoStyle}>
        <line className="figure-torso" x1={58} y1={66} x2={55} y2={118} />
        <line className="figure-neck" x1={60} y1={52} x2={58} y2={63} />
        <circle className="figure-head" cx={61} cy={41} r={13} />
        <g transform="translate(58,66)">
          <g style={{ transformOrigin: "0 0", animation: `${armAnim} 2.6s ease-in-out infinite` }}>
            <line className="figure-limb-upper" x1={0} y1={0} x2={21} y2={13} />
            <line className="figure-limb-fore" x1={21} y1={13} x2={39} y2={25} />
            <circle className="figure-accent" cx={39} cy={25} r={7} />
          </g>
        </g>
      </g>
    </SvgWrap>
  );
}

function StandingSquatFigure() {
  return (
    <SvgWrap>
      <ellipse className="figure-shadow figure-shadow-bob" cx={58} cy={153} rx={30} ry={6} />
      <line className="figure-rig" x1={18} y1={152} x2={102} y2={152} />
      <line className="figure-limb-thigh" x1={52} y1={120} x2={42} y2={138} />
      <line className="figure-limb-shin" x1={42} y1={138} x2={40} y2={152} />
      <line className="figure-limb-thigh" x1={52} y1={120} x2={62} y2={138} />
      <line className="figure-limb-shin" x1={62} y1={138} x2={64} y2={152} />
      <g style={{ animation: "squatBob 2.6s ease-in-out infinite" }}>
        <line className="figure-torso" x1={56} y1={64} x2={52} y2={120} />
        <line className="figure-neck" x1={58} y1={50} x2={56} y2={61} />
        <circle className="figure-head" cx={59} cy={39} r={13} />
        <line className="figure-limb-upper" x1={56} y1={66} x2={76} y2={72} />
        <circle className="figure-accent" cx={76} cy={72} r={6} />
        <line className="figure-limb-upper" x1={56} y1={66} x2={36} y2={72} />
        <circle className="figure-accent" cx={36} cy={72} r={6} />
        <line className="figure-rig" x1={26} y1={72} x2={86} y2={72} />
      </g>
    </SvgWrap>
  );
}

function SeatedLegFigure({ legAnim, reclined }: { legAnim: string; reclined?: boolean }) {
  const torsoStyle: React.CSSProperties = reclined
    ? { transformOrigin: "55px 118px", transform: "rotate(18deg)" }
    : {};
  return (
    <SvgWrap>
      <ellipse className="figure-shadow" cx={66} cy={153} rx={40} ry={6} />
      <line className="figure-rig" x1={12} y1={132} x2={72} y2={132} />
      {reclined ? (
        <line className="figure-rig" x1={12} y1={132} x2={6} y2={84} />
      ) : (
        <line className="figure-rig" x1={50} y1={132} x2={50} y2={148} />
      )}
      <g style={torsoStyle}>
        <line className="figure-torso" x1={55} y1={66} x2={58} y2={118} />
        <line className="figure-neck" x1={59} y1={52} x2={58} y2={63} />
        <circle className="figure-head" cx={61} cy={43} r={13} />
        <line className="figure-limb-upper" x1={58} y1={80} x2={42} y2={96} />
        <circle className="figure-accent" cx={42} cy={96} r={6} />
      </g>
      <g transform="translate(55,118)">
        <g style={{ transformOrigin: "0 0", animation: `${legAnim} 2.6s ease-in-out infinite` }}>
          <line className="figure-limb-thigh" x1={0} y1={0} x2={25} y2={5} />
          <line className="figure-limb-shin" x1={25} y1={5} x2={47} y2={9} />
          <circle className="figure-accent" cx={47} cy={9} r={7} />
        </g>
      </g>
    </SvgWrap>
  );
}

export default function ExerciseAnimation({
  machineId,
  mode,
}: {
  machineId: string;
  mode?: string | null;
}) {
  switch (machineId) {
    case "lat-pulldown-01":
      return <SeatedArmFigure armAnim="armPullDown" />;
    case "chest-press-02":
      return <SeatedArmFigure armAnim="armPressFwd" />;
    case "rowing-03":
      return <SeatedArmFigure armAnim="armRow" torsoAnim="torsoRow" />;
    case "pec-fly-rear-delt-04":
      return <SeatedArmFigure armAnim={mode === "rear-delt" ? "armFlyOut" : "armFlyIn"} />;
    case "shoulder-press-05":
      return <SeatedArmFigure armAnim="armPressUp" />;
    case "biceps-preacher-06":
      return <SeatedArmFigure armAnim="armCurl" />;
    case "squat-07":
      return <StandingSquatFigure />;
    case "leg-press-08":
      return <SeatedLegFigure legAnim="legPress" reclined />;
    case "leg-extension-09":
      return <SeatedLegFigure legAnim="legExtend" />;
    default:
      return <SeatedArmFigure armAnim="armPullDown" />;
  }
}
