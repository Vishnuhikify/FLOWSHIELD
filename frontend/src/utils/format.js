const int = new Intl.NumberFormat("en-IN");

export const formatPeople = (n) => int.format(n ?? 0);

export const formatDepth = (metres) => (metres == null ? "-" : `${metres.toFixed(2)} m`);

export const formatDepthCm = (metres) => {
  const cm = (metres ?? 0) * 100;
  return cm > 0 && cm < 1 ? "<1" : String(Math.round(cm));
};

export const formatMinutes = (min) => (min == null ? "-" : `${Number(min.toFixed(1))} min`);

export const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
