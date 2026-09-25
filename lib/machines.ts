// Machine catalog — ported 1:1 from the Racked Artifact prototype. This is
// static content, not user data, so it lives in code rather than a database
// table; if you add/rename a machine, this is the only place to edit.

export type MachineMode = {
  label: string;
  muscles: string[];
  instructions: [string, string][];
  mistakes: string[];
  tip: string;
  challenge: { weight: number; reps: number };
};

export type Machine = {
  id: string;
  number: string;
  name: string;
  muscles: string[];
  unit: string;
  dual?: boolean;
  instructions?: [string, string][];
  mistakes?: string[];
  tip?: string;
  challenge?: { weight: number; reps: number };
  modes?: Record<string, MachineMode>;
};

export const MACHINES: Machine[] = [
  {
    id: "lat-pulldown-01",
    number: "01",
    name: "Lat Pulldown",
    muscles: ["Lats", "Upper Back", "Biceps"],
    instructions: [
      ["Adjust the seat", "Secure your thighs underneath the support pad."],
      ["Select your weight", "Start with a manageable weight."],
      ["Grip the bar", "Use a comfortable overhand grip, just wider than shoulder-width."],
      ["Pull", "Pull the bar toward your upper chest while keeping your torso stable."],
      ["Control the return", "Slowly allow the bar to return to the starting position."],
    ],
    mistakes: [
      "Swinging your torso",
      "Pulling behind your neck",
      "Using excessive weight",
      "Letting the weight stack slam",
    ],
    tip: 'Think "elbows down" rather than "hands down".',
    challenge: { weight: 70, reps: 8 },
    unit: "KG",
  },
  {
    id: "chest-press-02",
    number: "02",
    name: "Chest Press",
    muscles: ["Chest", "Triceps", "Front Shoulders"],
    instructions: [
      ["Set the seat height", "Handles should align with the middle of your chest."],
      ["Select your weight", "Start with a manageable weight."],
      ["Brace", "Plant your feet and brace your core against the pad."],
      ["Press", "Press the handles forward until your arms are extended, without locking out."],
      ["Control the return", "Bring the handles back to the start slowly."],
    ],
    mistakes: [
      "Flaring elbows out to 90°",
      "Bouncing the handles at the bottom",
      "Arching your lower back off the pad",
      "Locking out elbows aggressively",
    ],
    tip: "Keep a slight bend in your elbows at full extension.",
    challenge: { weight: 60, reps: 8 },
    unit: "KG",
  },
  {
    id: "rowing-03",
    number: "03",
    name: "Rowing",
    muscles: ["Upper Back", "Lats", "Biceps"],
    instructions: [
      ["Adjust the seat", "Set seat and footplate distance so your knees are softly bent."],
      ["Select your weight", "Start with a manageable weight."],
      ["Grip the handle", "Use a neutral, shoulder-width grip."],
      ["Drive and pull", "Drive with your legs first, then pull the handle to your ribs."],
      ["Reset", "Extend your arms and lean forward slowly to reset."],
    ],
    mistakes: [
      "Rounding your lower back",
      "Pulling with arms before legs",
      "Using momentum instead of control",
      "Shrugging your shoulders at the top",
    ],
    tip: "Squeeze your shoulder blades together at the finish.",
    challenge: { weight: 55, reps: 10 },
    unit: "KG",
  },
  {
    id: "pec-fly-rear-delt-04",
    number: "04",
    name: "Pec Fly / Rear Delt",
    muscles: ["Chest", "Rear Delts", "Upper Back"],
    dual: true,
    modes: {
      "pec-fly": {
        label: "Pec Fly",
        muscles: ["Chest", "Front Shoulders"],
        instructions: [
          ["Set the seat", "Handles should sit at chest height."],
          ["Select your weight", "Start with a manageable weight."],
          ["Grip the handles", "Take hold with a slight bend in your elbows."],
          ["Hug inward", "Bring your hands together in front of your chest in a hugging motion."],
          ["Control the stretch", "Return slowly until you feel a stretch across your chest."],
        ],
        mistakes: [
          "Using too much weight and losing form",
          "Locking your elbows fully straight",
          "Letting the handles slam back",
          "Shrugging shoulders toward your ears",
        ],
        tip: "Imagine hugging a tree — lead with your elbows.",
        challenge: { weight: 45, reps: 10 },
      },
      "rear-delt": {
        label: "Rear Delt",
        muscles: ["Rear Delts", "Upper Back"],
        instructions: [
          ["Face the pad", "Sit with your chest against the pad."],
          ["Select your weight", "Start with a manageable weight."],
          ["Grip the handles", "Arms extended forward at chest height."],
          ["Reverse fly", "Pull your arms out and back in a reverse-fly motion."],
          ["Control the return", "Bring the handles back without letting the stack slam."],
        ],
        mistakes: [
          "Using your traps to shrug the weight up",
          "Bending your elbows too much (turns it into a row)",
          "Rushing the eccentric",
          "Arching your back off the pad",
        ],
        tip: "Keep arms almost straight and squeeze your shoulder blades.",
        challenge: { weight: 25, reps: 12 },
      },
    },
    unit: "KG",
  },
  {
    id: "shoulder-press-05",
    number: "05",
    name: "Shoulder Press",
    muscles: ["Shoulders", "Triceps"],
    instructions: [
      ["Adjust the seat", "Handles should start level with your shoulders."],
      ["Select your weight", "Start with a manageable weight."],
      ["Grip the handles", "Palms facing forward."],
      ["Press up", "Press upward until arms are extended, without locking out."],
      ["Lower with control", "Return to shoulder height under control."],
    ],
    mistakes: [
      "Arching your back to push more weight",
      "Flaring elbows too wide at the bottom",
      "Locking out elbows hard at the top",
      "Rushing the descent",
    ],
    tip: "Press up and slightly in, like drawing an arrow to a point overhead.",
    challenge: { weight: 40, reps: 8 },
    unit: "KG",
  },
  {
    id: "biceps-preacher-06",
    number: "06",
    name: "Biceps / Preacher Curl",
    muscles: ["Biceps", "Forearms"],
    instructions: [
      ["Adjust the seat", "Your armpits should rest at the top of the pad."],
      ["Select your weight", "Start with a manageable weight."],
      ["Grip", "Shoulder-width grip on the handles or bar."],
      ["Curl up", "Curl upward, squeezing at the top without lifting elbows off the pad."],
      ["Lower slowly", "Extend down until your arms are almost fully straight."],
    ],
    mistakes: [
      "Lifting elbows off the pad",
      "Using body momentum to swing the weight up",
      "Not controlling the lowering phase",
      "Going too heavy and cutting the range short",
    ],
    tip: "Slow the last two inches on the way down — that's where the growth happens.",
    challenge: { weight: 25, reps: 10 },
    unit: "KG",
  },
  {
    id: "squat-07",
    number: "07",
    name: "Squat",
    muscles: ["Quads", "Glutes", "Hamstrings", "Core"],
    instructions: [
      ["Set your position", "Shoulders under the pads, feet shoulder-width apart."],
      ["Select your weight", "Start with a manageable weight."],
      ["Brace and unrack", "Brace your core, stand tall to unrack."],
      ["Lower", "Bend knees and hips until thighs are at least parallel."],
      ["Drive up", "Push through your heels to stand back up."],
    ],
    mistakes: [
      "Letting knees cave inward",
      "Rising onto your toes",
      "Rounding your lower back at the bottom",
      "Cutting the depth short",
    ],
    tip: "Push the floor away with your whole foot, not just your toes.",
    challenge: { weight: 90, reps: 8 },
    unit: "KG",
  },
  {
    id: "leg-press-08",
    number: "08",
    name: "Leg Press",
    muscles: ["Quads", "Glutes", "Hamstrings"],
    instructions: [
      ["Set your feet", "Sit back, feet shoulder-width on the platform."],
      ["Select your weight", "Start with a manageable weight."],
      ["Release the safeties", "Release the safety catches."],
      ["Lower", "Lower the platform until knees reach about 90°."],
      ["Press up", "Press through your heels, stopping short of locking your knees."],
    ],
    mistakes: [
      "Locking knees out hard at the top",
      "Letting your lower back round off the pad",
      "Placing feet too low on the platform",
      "Going too heavy and shortening the range",
    ],
    tip: "Keep your knees tracking in line with your toes throughout.",
    challenge: { weight: 160, reps: 10 },
    unit: "KG",
  },
  {
    id: "leg-extension-09",
    number: "09",
    name: "Leg Extension",
    muscles: ["Quadriceps"],
    instructions: [
      ["Adjust the seat back", "Your knees should align with the machine's pivot point."],
      ["Set the shin pad", "Position it just above your ankles."],
      ["Select your weight", "Start with a manageable weight."],
      ["Extend", "Extend your legs until almost straight, squeezing your quads."],
      ["Lower with control", "Return slowly back to the start."],
    ],
    mistakes: [
      "Using momentum to kick the weight up",
      "Locking knees out hard at the top",
      "Going too heavy and shortening the range",
      "Letting the weight stack slam on the way down",
    ],
    tip: "Pause for a full second at the top to maximize the quad squeeze.",
    challenge: { weight: 50, reps: 12 },
    unit: "KG",
  },
];

export const MACHINE_MAP: Record<string, Machine> = Object.fromEntries(
  MACHINES.map((m) => [m.id, m])
);

export const MACHINE_IDS = MACHINES.map((m) => m.id);

export function machineModeKey(m: Machine, mode?: string | null) {
  return m.dual ? mode || Object.keys(m.modes!)[0] : null;
}

// Resolves the effective (instructions/mistakes/tip/challenge/muscles) view
// for a machine + optional mode, so callers don't need to branch on `dual`.
export function resolveMachineView(m: Machine, mode?: string | null) {
  if (m.dual) {
    const key = mode && m.modes![mode] ? mode : Object.keys(m.modes!)[0];
    const modeData = m.modes![key];
    return { modeKey: key, ...modeData };
  }
  return {
    modeKey: null as string | null,
    label: m.name,
    muscles: m.muscles,
    instructions: m.instructions!,
    mistakes: m.mistakes!,
    tip: m.tip!,
    challenge: m.challenge!,
  };
}
