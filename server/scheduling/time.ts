export function getLocalSnapshot(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}:${value("second")}`,
  };
}

export function localDateTimeToInstant(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Local date and time must use YYYY-MM-DDTHH:mm.");
  const [, year, month, day, hour, minute] = match;
  const desiredTimestamp = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  let candidate = new Date(desiredTimestamp);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const snapshot = getLocalSnapshot(candidate, timeZone);
    const observedTimestamp = Date.parse(`${snapshot.date}T${snapshot.time}Z`);
    const difference = desiredTimestamp - observedTimestamp;
    if (difference === 0) break;
    candidate = new Date(candidate.getTime() + difference);
  }

  const expectedDate = `${year}-${month}-${day}`;
  const expectedTime = `${hour}:${minute}:00`;
  const snapshot = getLocalSnapshot(candidate, timeZone);
  if (snapshot.date !== expectedDate || snapshot.time !== expectedTime) {
    throw new Error("This local time does not exist in the location timezone because of a daylight-saving transition.");
  }

  const alternate = [candidate.getTime() - 3_600_000, candidate.getTime() + 3_600_000]
    .map((timestamp) => getLocalSnapshot(new Date(timestamp), timeZone))
    .some((item) => item.date === expectedDate && item.time === expectedTime);
  if (alternate) {
    throw new Error("This local time occurs twice in the location timezone. Choose a time outside the daylight-saving transition hour.");
  }

  return candidate;
}
