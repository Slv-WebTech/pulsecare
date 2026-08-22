export function Card({ interactive = false, padded = true, className = "", children, ...rest }) {
  const classes = ["card", padded ? "card-padded" : "", interactive ? "card-interactive" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
