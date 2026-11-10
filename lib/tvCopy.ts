// Fun, gym-floor wording for the TV.

function nice(n: number) {
  return n < 10 ? (Math.round(n * 10) / 10).toString() : Math.round(n).toLocaleString("en-US");
}

// "≈ 3.1 elephants" -- makes a big kg number feel real.
export function kgEquivalent(kg: number): string {
  if (kg >= 4000) return `≈ ${nice(kg / 4000)} elephant${kg / 4000 >= 1.05 ? "s" : ""} lifted`;
  if (kg >= 1000) return `≈ ${nice(kg / 1000)} small car${kg / 1000 >= 1.05 ? "s" : ""} lifted`;
  if (kg >= 350) return `≈ ${nice(kg / 350)} auto-rickshaw${kg / 350 >= 1.05 ? "s" : ""} lifted`;
  if (kg > 0) {
    const plates = Math.max(1, Math.round(kg / 20));
    return `≈ ${plates} plate${plates === 1 ? "" : "s"} of 20 kg`;
  }
  return "The bar is waiting.";
}

export function fmtKg(n: number) {
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 1 });
}
