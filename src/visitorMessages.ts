export interface VisitorMessage {
  id: string;
  text: string;
  category: "Curiosity" | "Creativity" | "Kindness" | "Courage" | "Community";
  active: boolean;
  weight: number;
  order: number;
  createdAt: string;
  updatedAt: string;
  lastShownAt?: string;
}

export interface VisitorMessageRotation {
  currentId?: string;
  bag: string[];
  recentIds: string[];
}

const seedText: Array<[VisitorMessage["category"], string]> = [
  ["Curiosity", "What will you discover today?"],
  ["Curiosity", "Your curiosity belongs here."],
  ["Creativity", "Small hands can build big ideas."],
  ["Curiosity", "Ask one more question."],
  ["Creativity", "Try the idea that feels a little strange."],
  ["Curiosity", "Every expert started by wondering."],
  ["Curiosity", "Look closely—something surprising may be hiding."],
  ["Creativity", "Make something only you would make."],
  ["Creativity", "There is more than one way to solve it."],
  ["Creativity", "Build it, test it, change it, try again."],
  ["Courage", "Mistakes are proof that your brain is exploring."],
  ["Courage", "Turn “I can’t” into “I haven’t yet.”"],
  ["Creativity", "Let your imagination make the first move."],
  ["Creativity", "Today is a good day to invent something."],
  ["Kindness", "Kindness is a superpower anyone can practice."],
  ["Kindness", "Help someone feel welcome."],
  ["Community", "Share the space. Share the fun."],
  ["Kindness", "Notice who might need a teammate."],
  ["Kindness", "A small good deed can travel a long way."],
  ["Kindness", "Leave this place a little kinder than you found it."],
  ["Kindness", "Say thank you to someone who helped today."],
  ["Community", "Make room for another person’s idea."],
  ["Courage", "Be brave enough to try badly at first."],
  ["Courage", "Courage can sound like, “I’ll try.”"],
  ["Courage", "You do not have to know the answer to begin."],
  ["Curiosity", "Take your time. Wonder is not a race."],
  ["Courage", "Try again with one tiny change."],
  ["Creativity", "Big discoveries often begin with a weird guess."],
  ["Courage", "Your idea matters, even before it is finished."],
  ["Courage", "Be proud of the part you figured out."],
  ["Creativity", "Play is serious work for growing minds."],
  ["Community", "Imagination grows when we use it together."],
  ["Community", "Build a world someone else can join."],
  ["Kindness", "What good deed will you add today?"],
  ["Kindness", "Make wonder possible for the next visitor."],
  ["Community", "Teach someone one thing you learned."],
  ["Community", "Listen for an idea different from yours."],
  ["Community", "Take care of the tools that help everyone play."],
  ["Community", "The museum is better when everyone belongs."],
  ["Curiosity", "Today’s question may become tomorrow’s invention."],
  ["Curiosity", "Carry one spark of wonder home with you."],
  ["Kindness", "Pay the fun forward."]
];

const SEED_TIMESTAMP = "2026-01-01T08:00:00.000Z";

export const seededVisitorMessages: VisitorMessage[] = seedText.map(([category, text], index) => ({
  id: `visitor-message-${String(index + 1).padStart(2, "0")}`,
  text,
  category,
  active: true,
  weight: 1,
  order: index,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
}));

export function normalizeVisitorMessages(value: unknown): VisitorMessage[] {
  if (!Array.isArray(value)) return seededVisitorMessages.map((message) => ({ ...message }));
  const incoming = value;
  const normalized = incoming.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Partial<VisitorMessage>;
    const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
    if (!text) return [];
    const category = ["Curiosity", "Creativity", "Kindness", "Courage", "Community"].includes(candidate.category ?? "")
      ? candidate.category as VisitorMessage["category"]
      : "Curiosity";
    const createdAt = typeof candidate.createdAt === "string" ? candidate.createdAt : SEED_TIMESTAMP;
    return [{
      id: typeof candidate.id === "string" && candidate.id ? candidate.id : `visitor-message-imported-${index + 1}`,
      text,
      category,
      active: candidate.active !== false,
      weight: Number.isFinite(candidate.weight) ? Math.max(1, Math.min(10, Number(candidate.weight))) : 1,
      order: Number.isFinite(candidate.order) ? Math.max(0, Number(candidate.order)) : index,
      createdAt,
      updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : createdAt,
      ...(typeof candidate.lastShownAt === "string" ? { lastShownAt: candidate.lastShownAt } : {})
    } satisfies VisitorMessage];
  });

  return normalized.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function normalizeVisitorMessageRotation(
  value: unknown,
  messages: VisitorMessage[]
): VisitorMessageRotation {
  const candidate = value && typeof value === "object" ? value as Partial<VisitorMessageRotation> : {};
  const activeIds = new Set(messages.filter((message) => message.active).map((message) => message.id));
  const uniqueActive = (ids: unknown) => Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string" && activeIds.has(id)).filter((id, index, all) => all.indexOf(id) === index)
    : [];
  const currentId = typeof candidate.currentId === "string" && activeIds.has(candidate.currentId) ? candidate.currentId : undefined;
  return {
    ...(currentId ? { currentId } : {}),
    bag: uniqueActive(candidate.bag),
    recentIds: uniqueActive(candidate.recentIds).slice(-6)
  };
}

function weightedShuffle(messages: VisitorMessage[], random: () => number): string[] {
  const candidates = messages.map((message) => ({ id: message.id, key: Math.pow(Math.max(random(), 0.000001), 1 / Math.max(1, message.weight)) }));
  return candidates.sort((a, b) => b.key - a.key).map((candidate) => candidate.id);
}

export function nextVisitorMessage(
  messages: VisitorMessage[],
  rotation: VisitorMessageRotation,
  random: () => number = Math.random
): { message?: VisitorMessage; messages: VisitorMessage[]; rotation: VisitorMessageRotation } {
  const active = messages.filter((message) => message.active).sort((a, b) => a.order - b.order);
  if (!active.length) return { messages, rotation: { bag: [], recentIds: [] } };

  const activeIds = new Set(active.map((message) => message.id));
  const recent = rotation.recentIds.filter((id) => activeIds.has(id)).slice(-6);
  let bag = rotation.bag.filter((id) => activeIds.has(id));
  if (!bag.length) {
    const eligible = active.filter((message) => !recent.includes(message.id));
    bag = weightedShuffle(eligible.length ? eligible : active, random);
  }

  let nextId = bag.shift();
  if (nextId && nextId === rotation.currentId && bag.length) {
    bag.push(nextId);
    nextId = bag.shift();
  }
  const message = active.find((candidate) => candidate.id === nextId) ?? active[0];
  const shownAt = new Date().toISOString();
  return {
    message,
    messages: messages.map((candidate) => candidate.id === message.id ? { ...candidate, lastShownAt: shownAt } : candidate),
    rotation: {
      currentId: message.id,
      bag,
      recentIds: [...recent.filter((id) => id !== message.id), message.id].slice(-6)
    }
  };
}
