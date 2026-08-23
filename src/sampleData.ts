import type { BoardPanel, Donor, DonorBoardProgram, GivingProgram, LanternState, SavedAnnouncement, SavedBlip } from "./types";
import { makeBrigadeOpeningPayment } from "./donorDomain";
import { PHASE4_CONTENT_VERSION, seededCostumes } from "./effectStudio";
import { createPhase3DemoSchedule, phase3Announcements } from "./phase3Schedule";
import { seededVisitorMessages } from "./visitorMessages";

/** Installs the historical donor walls without altering existing donor records. */
export const LEGACY_DONOR_STARS_CONTENT_VERSION = 9;
export const DONOR_ROSTER_BOARDS_CONTENT_VERSION = 10;
/** One-time recovery for a single accidentally removed legacy recognition star. */
export const LEGACY_STAR_RECOVERY_CONTENT_VERSION = 11;
/** Adds the exact Legacy tag to every donor transcribed from a recognition star. */
export const LEGACY_DONOR_TAGS_CONTENT_VERSION = 12;
/** Replaces the legacy brass outline treatment with clear, flat board text. */
/** Makes legacy recognition stars independent image and text layers. */
export const LEGACY_STAR_LAYER_CONTENT_VERSION = 14;
/** Repairs early announcement placements that treated layout X as a left edge. */
export const ANNOUNCEMENT_LAYOUT_CONTENT_VERSION = 15;
export const QUESTIONING_TOY_SOLDIER_CONTENT_VERSION = 16;
/** Removes retired display attachment, heartbeat, and manual live-toggle state. */
export const DISPLAY_STATUS_REMOVAL_CONTENT_VERSION = 17;
export const LANTERN_CONTENT_VERSION = DISPLAY_STATUS_REMOVAL_CONTENT_VERSION;

const exploreNames = [
  "Kevin & Sandy Huber",
  "Duane Isetti",
  "Patrick & Marggie Johnston",
  "Stefanie & Ted Leland",
  "Francesca & John Vera",
  "Joanne Waters"
] as const;

const playNames = [
  "Denise & Rob Aitken",
  "Diane Batres",
  "Mary Bava",
  "Patricia Busher",
  "Sandra & Clarence Chan",
  "Lisa Corren",
  "Kevin & Julie Dougherty",
  "Edward Figueroa",
  "George & Cherie Gibson",
  "Judy & Walt Ghio",
  "Merrill Hambright",
  "Phillip Herrera",
  "Craig & Denise Holmes",
  "Loreen Huey",
  "Carrie & Dan Natividad",
  "Ana Pacheco",
  "Tina Wells-Lee & Clem Lee",
  "John & Rosa Solis",
  "Mark Williams",
  "Beth Stoebner & David Warfolk"
] as const;

const toySoldierProgram: GivingProgram = {
  id: "toy-soldier-brigade",
  name: "Toy Soldier Brigade",
  classLabel: "Class of 2026",
  classYear: "2026",
  description: "A multi-year giving society of pledged support of $1,000+ per year for five years in unrestricted funds.",
  fundDesignation: "Unrestricted funds",
  invitation: "Join a community committed to sustaining play, imagination, and discovery for Stockton children and families.",
  impactStatement: "Dependable, unrestricted support helps the museum care for hands-on experiences and work toward broader, more affordable access for local children.",
  goodDeedPrompt: "Play it forward: kindness, service, and generosity help imagination grow. What good deed will you add today?",
  contactName: "Edward Figueroa",
  contactPhone: "209-465-4392",
  contactEmail: "EFigueroa@childrensmuseumstockton.org",
  website: "childrensmuseumstockton.org",
  address: "402 W. Weber Ave., Stockton, CA 95203",
  levels: [
    { id: "explore", name: "Explore", annualPledge: 5000, years: 5, description: "$5,000 each year for five years", color: "#1675a8", minAmount: 5000, maxAmount: 5000, displayOrder: 0, active: true },
    { id: "play", name: "Play", annualPledge: 1000, years: 5, description: "$1,000 each year for five years", color: "#c74432", minAmount: 1000, maxAmount: 4999.99, displayOrder: 1, active: true }
  ],
  spotlightDonorId: "toy-explorer-5",
  displayOrder: 0,
  active: true,
  allowOneTimeQualification: false
};

function makeBrigadeDonor(name: string, index: number, level: GivingProgram["levels"][number]): Donor {
  const levelLabel = `${level.name} Level`;
  return {
    id: `toy-${level.id === "explore" ? "explorer" : "play"}-${index + 1}`,
    name,
    tier: level.name,
    category: "Giving Society",
    active: true,
    since: "2026",
    note: `${level.description} pledged to unrestricted funds`,
    basicInfo: `${levelLabel} · ${level.description} · Class of 2026`,
    expandedInfo: `A ${toySoldierProgram.name} ${levelLabel} member whose five-year pledge supports the museum's mission through unrestricted funds.`,
    subtext: `${levelLabel} · Class of 2026`,
    tags: ["Toy Soldier Brigade", "Class of 2026", levelLabel, "Five-year pledge"],
    groupId: `group-toy-${level.id}`,
    donations: [],
    displayIds: ["display-1", "display-2"],
    givingProgramId: toySoldierProgram.id,
    givingLevelId: level.id,
    pledgeAnnualAmount: level.annualPledge,
    pledgeYears: level.years,
    pledgeStartYear: "2026",
    pledgeStatus: "Pledged",
    recognitionOrder: index + 1
  };
}

const withOpeningPayment = (donor: Donor): Donor => ({
  ...donor,
  donations: [makeBrigadeOpeningPayment(donor)],
  boardIds: [
    "board-toy-soldier-portrait",
    "board-toy-soldier-landscape",
    `board-toy-${donor.tier.toLowerCase()}-portrait`,
    `board-toy-${donor.tier.toLowerCase()}-landscape`,
    ...(donor.id === toySoldierProgram.spotlightDonorId
      ? ["board-supporter-spotlight-portrait", "board-supporter-spotlight-landscape"]
      : [])
  ]
});
const exploreDonors = exploreNames.map((name, index) => withOpeningPayment(makeBrigadeDonor(name, index, toySoldierProgram.levels[0])));
const playDonors = playNames.map((name, index) => withOpeningPayment(makeBrigadeDonor(name, index, toySoldierProgram.levels[1])));
const officialDonors = [...exploreDonors, ...playDonors];
const exploreIds = exploreDonors.map((donor) => donor.id);
const playIds = playDonors.map((donor) => donor.id);
const brigadeIds = [...exploreIds, ...playIds];

const legacyPhoto1Names = [
  "San Joaquin Sheriff's Dept. Community",
  "PFL 2000",
  "Bank of Agriculture",
  "Palm and Ben Lema Family",
  "Thompson-Hysell Engineers",
  "Mr. Trucker",
  "Banks Michael (?)",
  "Roman Marilyn Harvey",
  "Fritz & Phyllis Grupe",
  "Bob & Barbara Byington",
  "Kalia Nalan (?)",
  "Harvey/Oster (?)",
  "Human Services Agency",
  "Blair Family Accent Interiors",
  "Ed Sprague's Gold Medal Classic",
  "Dick & Sharon Leland",
  "Neudeck Family",
  "Salazar & Crane Families",
  "Kathleen Penninger (?)",
  "The Bogetti Family",
  "Roger Lang",
  "Karen McKee"
] as const;

const legacyPhoto2Names = [
  "D.S.S. (?)",
  "Stockton Scavenger",
  "John Quinn Food 4 Less",
  "Kaiser Permanente",
  "Dr. Thomas Nguyen / Dr. Anh Le",
  "Carr Electric",
  "Bank of Stockton",
  "John & Merrill Hambright",
  "Unilever",
  "… B.J. (?)",
  "Teresa Marrelo (?)",
  "City of Stockton",
  "Kenzie Belcher",
  "Dean & Kathy Jansen",
  "PM Cedar Products",
  "Mackenzie Mell Snyder (?)",
  "Cortopassi",
  "U.O.P.",
  "Kavanaugh Family",
  "Lester Fleming"
] as const;

function makeLegacyDonor(name: string, photo: 1 | 2, index: number): Donor {
  const id = `legacy-photo${photo}-${String(index + 1).padStart(2, "0")}`;
  return {
    id,
    name,
    tier: "Legacy donor",
    category: "Legacy",
    active: true,
    since: "Legacy",
    note: "Legacy donor added from a historical recognition star wall. Donation amount unknown.",
    basicInfo: "Legacy donor · historical recognition wall",
    expandedInfo: "This donor was transcribed from a historical recognition wall. Donation amount is unknown.",
    tags: ["Legacy", "Legacy donor", "Historical star wall", `Photo ${photo}`],
    donationType: "Legacy",
    amountUnknown: true,
    donations: [],
    displayIds: [],
    boardIds: ["board-legacy-donors-portrait", `board-legacy-stars-photo-${photo}`],
    recognitionOrder: index + 1
  };
}

export const legacyDonors: Donor[] = [
  ...legacyPhoto1Names.map((name, index) => makeLegacyDonor(name, 1, index)),
  ...legacyPhoto2Names.map((name, index) => makeLegacyDonor(name, 2, index))
];

const legacyPhoto1Ids = legacyDonors.filter((donor) => donor.id.startsWith("legacy-photo1-")).map((donor) => donor.id);
const legacyPhoto2Ids = legacyDonors.filter((donor) => donor.id.startsWith("legacy-photo2-")).map((donor) => donor.id);
const legacyDonorIds = legacyDonors.map((donor) => donor.id);

function legacyStarPanels(donorId: string, position: [number, number, number, number], fontSize = 12): BoardPanel[] {
  const donor = legacyDonors.find((item) => item.id === donorId);
  return [
    { id: `${donorId}-star-image`, type: "image", title: "Recognition star", size: "standard", x: position[0], y: position[1], width: position[2], height: position[3], imageUrl: "/assets/donor-icons/legacy-star-flat.svg", imageFit: "contain" },
    { id: `${donorId}-star-text`, type: "text", title: donor?.name ?? "Legacy donor", size: "standard", x: position[0], y: position[1], width: position[2], height: position[3], fontFamily: "DM Sans", fontSize, textColor: "#201708", lineHeight: .92 }
  ];
}

function legacyStarWallBoard(
  photo: 1 | 2,
  orientation: "Portrait" | "Landscape",
  positions: Array<[number, number, number, number]>
): DonorBoardProgram {
  const ids = photo === 1 ? legacyPhoto1Ids : legacyPhoto2Ids;
  return {
    id: `board-legacy-stars-photo-${photo}`,
    name: `Legacy Donor Star Wall · ${orientation}`,
    orientation,
    heading: "LEGACY DONORS",
    subtitle: "A WALL OF GRATITUDE",
    description: "Historical donor recognition stars",
    footer: "With gratitude to the friends who helped build our museum.",
    columns: 1,
    donorIds: ids,
    active: true,
    templatePurpose: "roster",
    palette: photo === 1 ? "legacy-navy" : "legacy-sky",
    fontFamily: "DM Sans",
    showFrame: false,
    showIcons: false,
    showSubtext: false,
    donorPresentation: { fontFamily: "DM Sans", nameColor: "#201708", accentColor: "#201708", recognitionIcon: "none" },
    panels: ids.flatMap((id, index) => legacyStarPanels(id, positions[index], orientation === "Portrait" ? 8 : 10))
  };
}

const legacyPhoto1StarPositions: Array<[number, number, number, number]> = [
  [22, 4, 25, 14], [8, 23, 19, 12], [43, 7, 19, 12], [61, 4, 26, 15], [74, 22, 19, 13],
  [31, 24, 18, 12], [48, 28, 17, 12], [7, 37, 20, 12], [24, 39, 18, 11], [48, 39, 24, 15],
  [74, 39, 20, 12], [82, 31, 15, 12], [37, 48, 20, 13], [10, 53, 21, 13], [28, 59, 18, 12],
  [57, 56, 22, 14], [77, 55, 18, 12], [7, 67, 20, 12], [39, 67, 20, 13], [76, 70, 19, 12],
  [11, 79, 17, 11], [27, 78, 19, 12]
];

const legacyPhoto2StarPositions: Array<[number, number, number, number]> = [
  [3, 5, 16, 22], [19, 7, 17, 22], [35, 5, 17, 22], [53, 6, 17, 22], [75, 8, 17, 24],
  [10, 24, 17, 22], [27, 25, 17, 22], [47, 26, 17, 23], [75, 30, 17, 23], [2, 40, 15, 22],
  [22, 39, 16, 21], [39, 43, 17, 23], [60, 44, 17, 24], [7, 57, 16, 22], [24, 56, 17, 23],
  [42, 63, 17, 24], [58, 57, 17, 23], [76, 57, 17, 23], [84, 43, 16, 22], [43, 75, 17, 24]
];

function legacyDonorsBoard(): DonorBoardProgram {
  return {
    id: "board-legacy-donors-portrait",
    name: "Legacy Donors · Honor Roll · Portrait",
    orientation: "Portrait",
    heading: "LEGACY DONORS",
    subtitle: "WITH GRATITUDE",
    description: "Honoring the friends who helped build our museum.",
    footer: "Donation amounts are not recorded for this historical recognition list.",
    columns: 2,
    donorIds: legacyDonorIds,
    active: true,
    templatePurpose: "roster",
    palette: "classic",
    fontFamily: "Libre Baskerville",
    showFrame: true,
    showIcons: false,
    showSubtext: false,
    panels: [
      { id: "legacy-list-heading", type: "heading", title: "LEGACY DONORS", size: "feature", x: 8, y: 5, width: 84, height: 8, fontFamily: "Cinzel", fontSize: 34 },
      { id: "legacy-list-intro", type: "message", eyebrow: "WITH GRATITUDE", title: "A lasting foundation for play and discovery", body: "We honor the historical supporters whose generosity helped our museum grow.", size: "standard", x: 10, y: 14, width: 80, height: 11, fontFamily: "Libre Baskerville", fontSize: 21 },
      { id: "legacy-list-donors", type: "donors", title: "", size: "feature", columns: 2, rows: 21, donorIds: legacyDonorIds, x: 8, y: 28, width: 84, height: 61, fontFamily: "Libre Baskerville", fontSize: 16, donorDividerOpacity: 10 },
      { id: "legacy-list-footer", type: "footer", title: "WITH GRATITUDE TO OUR LEGACY DONORS", size: "compact", x: 10, y: 92, width: 80, height: 4, fontFamily: "DM Sans", fontSize: 10, footerIconPlacement: "both" }
    ]
  };
}

export const legacyBoardPrograms: DonorBoardProgram[] = [
  legacyStarWallBoard(1, "Portrait", legacyPhoto1StarPositions),
  legacyStarWallBoard(2, "Landscape", legacyPhoto2StarPositions),
  legacyDonorsBoard()
];

function generousDonorRosterBoard(audience: "brigade" | "legacy"): DonorBoardProgram {
  const brigade = audience === "brigade";
  const id = brigade ? "board-generous-toy-soldier-portrait" : "board-generous-legacy-portrait";
  const donorIds = brigade ? brigadeIds : legacyDonorIds;
  const heading = brigade ? "TOY SOLDIER BRIGADE" : "LEGACY DONORS";
  return {
    id,
    name: `Our Generous Donors · ${brigade ? "Toy Soldier Brigade" : "Legacy Donors"} · Portrait`,
    orientation: "Portrait",
    heading,
    subtitle: "OUR GENEROUS DONORS",
    description: brigade
      ? "Recognizing the Toy Soldier Brigade members investing in the power of play."
      : "Recognizing the legacy donors whose generosity helped our museum grow.",
    footer: brigade ? "WITH GRATITUDE TO OUR TOY SOLDIER BRIGADE" : "WITH GRATITUDE TO OUR LEGACY DONORS",
    columns: 2,
    donorIds,
    active: true,
    givingProgramId: brigade ? toySoldierProgram.id : undefined,
    templatePurpose: "roster",
    palette: "classic",
    fontFamily: "Libre Baskerville",
    showFrame: true,
    showIcons: false,
    showSubtext: false,
    donorScrollEnabled: false,
    panels: [
      { id: `${id}-heading`, type: "heading", title: heading, size: "feature", x: 8, y: 5, width: 84, height: 7, fontFamily: "Cinzel", fontSize: 32 },
      { id: `${id}-intro`, type: "message", eyebrow: "OUR GENEROUS DONORS", title: "WITH GRATITUDE", body: brigade ? "Honoring the Toy Soldier Brigade." : "Honoring our legacy donors.", size: "standard", x: 10, y: 13, width: 80, height: 9, fontFamily: "Libre Baskerville", fontSize: 18 },
      { id: `${id}-donors`, type: "donors", title: "", size: "feature", columns: 2, rows: brigade ? 13 : 21, donorIds, x: 8, y: 25, width: 84, height: 64, fontFamily: "Libre Baskerville", fontSize: brigade ? 18 : 16, donorDividerOpacity: 10 },
      { id: `${id}-footer`, type: "footer", title: brigade ? "WITH GRATITUDE TO OUR TOY SOLDIER BRIGADE" : "WITH GRATITUDE TO OUR LEGACY DONORS", size: "compact", x: 10, y: 92, width: 80, height: 4, fontFamily: "DM Sans", fontSize: 10, footerIconPlacement: "both" }
    ]
  };
}

export const generousDonorBoardPrograms: DonorBoardProgram[] = [
  generousDonorRosterBoard("brigade"),
  generousDonorRosterBoard("legacy")
];

function fullRosterBoard(orientation: "Portrait" | "Landscape"): DonorBoardProgram {
  const portrait = orientation === "Portrait";
  const short = portrait ? "p" : "l";
  return {
    id: `board-toy-soldier-${orientation.toLowerCase()}`,
    name: `Toy Soldier Brigade · Full Roster · ${orientation}`,
    orientation,
    heading: "TOY SOLDIER BRIGADE",
    subtitle: "INTRODUCING THE CLASS OF 2026",
    description: toySoldierProgram.description,
    footer: "With gratitude to every member of the Class of 2026.",
    columns: 2,
    donorIds: brigadeIds,
    active: true,
    givingProgramId: toySoldierProgram.id,
    templatePurpose: "roster",
    palette: "brigade-blue",
    fontFamily: "Quicksand",
    showFrame: true,
    donorScrollEnabled: false,
    panels: portrait ? [
      { id: `${short}-roster-heading`, type: "heading", title: "TOY SOLDIER BRIGADE", size: "feature", x: 7, y: 4, width: 86, height: 7, fontFamily: "Cabin Sketch", fontSize: 37 },
      { id: `${short}-roster-intro`, type: "message", eyebrow: "INTRODUCING THE CLASS OF 2026", title: "Five years of play, possibility, and purpose", body: "A giving society pledging $1,000+ each year for five years in unrestricted funds.", size: "standard", x: 8, y: 12, width: 84, height: 10, fontSize: 24 },
      { id: `${short}-explore-label`, type: "supporters-heading", title: "EXPLORE LEVEL · $5,000/YEAR FOR 5 YEARS", size: "compact", x: 8, y: 24, width: 84, height: 4, fontSize: 17 },
      { id: `${short}-explore-names`, type: "donors", title: "Explore Level", size: "standard", columns: 2, rows: 3, donorTierFilter: ["Explore"], x: 8, y: 29, width: 84, height: 15, fontSize: 22, donorDividerOpacity: 12 },
      { id: `${short}-play-label`, type: "supporters-heading", title: "PLAY LEVEL · $1,000/YEAR FOR 5 YEARS", size: "compact", x: 8, y: 47, width: 84, height: 4, fontSize: 17 },
      { id: `${short}-play-names`, type: "donors", title: "Play Level", size: "standard", columns: 2, rows: 10, donorTierFilter: ["Play"], x: 7, y: 52, width: 86, height: 38, fontSize: 18, donorDividerOpacity: 10 },
      { id: `${short}-roster-footer`, type: "footer", title: "With gratitude to every member of the Class of 2026.", size: "compact", x: 8, y: 93, width: 84, height: 4, fontSize: 13, footerIconPlacement: "both" }
    ] : [
      { id: `${short}-roster-heading`, type: "heading", title: "TOY SOLDIER BRIGADE", size: "feature", x: 5, y: 4, width: 90, height: 9, fontFamily: "Cabin Sketch", fontSize: 40 },
      { id: `${short}-roster-intro`, type: "message", eyebrow: "INTRODUCING THE CLASS OF 2026", title: "Five years of play, possibility, and purpose", body: "A giving society pledging $1,000+ each year for five years in unrestricted funds.", size: "standard", x: 6, y: 14, width: 88, height: 13, fontSize: 24 },
      { id: `${short}-explore-label`, type: "supporters-heading", title: "EXPLORE LEVEL · $5,000/YEAR FOR 5 YEARS", size: "compact", x: 5, y: 31, width: 33, height: 6, fontSize: 17 },
      { id: `${short}-explore-names`, type: "donors", title: "Explore Level", size: "standard", columns: 1, rows: 6, donorTierFilter: ["Explore"], x: 5, y: 38, width: 33, height: 43, fontSize: 22, donorDividerOpacity: 12 },
      { id: `${short}-play-label`, type: "supporters-heading", title: "PLAY LEVEL · $1,000/YEAR FOR 5 YEARS", size: "compact", x: 42, y: 31, width: 53, height: 6, fontSize: 17 },
      { id: `${short}-play-names`, type: "donors", title: "Play Level", size: "standard", columns: 2, rows: 10, donorTierFilter: ["Play"], x: 41, y: 38, width: 55, height: 43, fontSize: 18, donorDividerOpacity: 10 },
      { id: `${short}-roster-footer`, type: "footer", title: "With gratitude to every member of the Class of 2026.", size: "compact", x: 12, y: 87, width: 76, height: 7, fontSize: 13, footerIconPlacement: "both" }
    ]
  };
}

function levelBoard(level: "Explore" | "Play", orientation: "Portrait" | "Landscape"): DonorBoardProgram {
  const portrait = orientation === "Portrait";
  const isExplore = level === "Explore";
  const ids = isExplore ? exploreIds : playIds;
  const annual = isExplore ? "$5,000" : "$1,000";
  const short = `${level.toLowerCase()}-${portrait ? "p" : "l"}`;
  return {
    id: `board-toy-${level.toLowerCase()}-${orientation.toLowerCase()}`,
    name: `${level} Level Honor Roll · ${orientation}`,
    orientation,
    heading: `${level.toUpperCase()} LEVEL MEMBERS`,
    subtitle: `${annual}/YEAR FOR FIVE YEARS`,
    description: "Class of 2026",
    footer: "Thank you for investing in the power of play.",
    columns: portrait ? 1 : 2,
    donorIds: ids,
    active: true,
    givingProgramId: toySoldierProgram.id,
    templatePurpose: "level",
    palette: isExplore ? "brigade-blue" : "brigade-red",
    fontFamily: "Quicksand",
    showFrame: true,
    donorScrollEnabled: false,
    panels: [
      { id: `${short}-heading`, type: "heading", title: `${level.toUpperCase()} LEVEL MEMBERS`, size: "feature", x: 6, y: 6, width: 88, height: portrait ? 9 : 12, fontFamily: "Cabin Sketch", fontSize: portrait ? 36 : 42 },
      { id: `${short}-message`, type: "message", eyebrow: "TOY SOLDIER BRIGADE · CLASS OF 2026", title: `${annual} each year for five years`, body: "Unrestricted support that helps imagination and discovery grow.", size: "standard", x: 9, y: portrait ? 17 : 21, width: 82, height: portrait ? 15 : 18, fontSize: 25 },
      { id: `${short}-names`, type: "donors", title: `${level} Level`, size: "feature", columns: portrait ? 1 : isExplore ? 2 : 4, rows: portrait ? ids.length : isExplore ? 3 : 5, donorTierFilter: [level], x: portrait ? 10 : 6, y: portrait ? 36 : 43, width: portrait ? 80 : 88, height: portrait ? 48 : 38, fontSize: portrait ? (isExplore ? 29 : 22) : isExplore ? 28 : 19, donorDividerOpacity: 14 },
      { id: `${short}-footer`, type: "footer", title: "Thank you for investing in the power of play.", size: "compact", x: 10, y: portrait ? 90 : 87, width: 80, height: portrait ? 5 : 7, fontSize: 14, footerIconPlacement: "both" }
    ]
  };
}

function aboutBoard(orientation: "Portrait" | "Landscape"): DonorBoardProgram {
  const portrait = orientation === "Portrait";
  const short = `about-${portrait ? "p" : "l"}`;
  return {
    id: `board-toy-about-${orientation.toLowerCase()}`,
    name: `What Is the Brigade? · ${orientation}`,
    orientation,
    heading: "WHAT IS THE TOY SOLDIER BRIGADE?",
    subtitle: "PHILANTHROPY WITH PURPOSE",
    description: toySoldierProgram.description,
    footer: "Curious to learn more? Contact Edward Figueroa · 209-465-4392",
    columns: 1,
    donorIds: [],
    active: true,
    givingProgramId: toySoldierProgram.id,
    templatePurpose: "invitation",
    palette: "brigade-cream",
    fontFamily: "Quicksand",
    showFrame: true,
    panels: portrait ? [
      { id: `${short}-heading`, type: "heading", title: "WHAT IS THE TOY SOLDIER BRIGADE?", size: "feature", x: 7, y: 5, width: 86, height: 9, fontFamily: "Cabin Sketch", fontSize: 33 },
      { id: `${short}-soldier`, type: "image", title: "Toy Soldier Brigade", imageUrl: "/assets/donor-icons/toy-soldier-questioning.png", imageFit: "contain", size: "standard", x: 35, y: 16, width: 30, height: 18 },
      { id: `${short}-story`, type: "message", eyebrow: "PHILANTHROPY WITH PURPOSE", title: "Steady support. More room to imagine.", body: toySoldierProgram.description, size: "feature", x: 8, y: 36, width: 84, height: 25, fontSize: 26 },
      { id: `${short}-explore`, type: "message", eyebrow: "EXPLORE LEVEL", title: "$5,000 each year", body: "A five-year pledge to unrestricted funds.", size: "standard", x: 8, y: 65, width: 40, height: 17, fontSize: 20 },
      { id: `${short}-play`, type: "message", eyebrow: "PLAY LEVEL", title: "$1,000 each year", body: "A five-year pledge to unrestricted funds.", size: "standard", x: 52, y: 65, width: 40, height: 17, fontSize: 20 },
      { id: `${short}-footer`, type: "footer", title: "Curious to learn more? Contact Edward Figueroa · 209-465-4392", size: "compact", x: 8, y: 89, width: 84, height: 6, fontSize: 13 }
    ] : [
      { id: `${short}-heading`, type: "heading", title: "WHAT IS THE TOY SOLDIER BRIGADE?", size: "feature", x: 5, y: 5, width: 90, height: 10, fontFamily: "Cabin Sketch", fontSize: 39 },
      { id: `${short}-soldier`, type: "image", title: "Toy Soldier Brigade", imageUrl: "/assets/donor-icons/toy-soldier.png", imageFit: "contain", size: "feature", x: 5, y: 20, width: 20, height: 49 },
      { id: `${short}-story`, type: "message", eyebrow: "PHILANTHROPY WITH PURPOSE", title: "Steady support. More room to imagine.", body: toySoldierProgram.description, size: "feature", x: 29, y: 19, width: 66, height: 27, fontSize: 27 },
      { id: `${short}-explore`, type: "message", eyebrow: "EXPLORE LEVEL", title: "$5,000 each year", body: "A five-year pledge to unrestricted funds.", size: "standard", x: 29, y: 50, width: 31, height: 22, fontSize: 20 },
      { id: `${short}-play`, type: "message", eyebrow: "PLAY LEVEL", title: "$1,000 each year", body: "A five-year pledge to unrestricted funds.", size: "standard", x: 64, y: 50, width: 31, height: 22, fontSize: 20 },
      { id: `${short}-footer`, type: "footer", title: "Curious to learn more? Contact Edward Figueroa · 209-465-4392", size: "compact", x: 10, y: 84, width: 80, height: 8, fontSize: 13 }
    ]
  };
}

function goodDeedsBoard(orientation: "Portrait" | "Landscape"): DonorBoardProgram {
  const portrait = orientation === "Portrait";
  const short = `good-${portrait ? "p" : "l"}`;
  const deedPanels = [
    { eyebrow: "LEND A HAND", title: "Help a friend", body: "Small acts of care make every space more welcoming." },
    { eyebrow: "MAKE ROOM", title: "Invite someone to play", body: "Curiosity grows when everyone gets a turn." },
    { eyebrow: "CARE TOGETHER", title: "Protect what we share", body: "Treat the museum, our city, and one another with respect." }
  ];
  return {
    id: `board-toy-good-deeds-${orientation.toLowerCase()}`,
    name: `Kindness Is Part of the Brigade · ${orientation}`,
    orientation,
    heading: "KINDNESS IS PART OF THE BRIGADE",
    subtitle: "PLAY IT FORWARD",
    description: toySoldierProgram.goodDeedPrompt,
    footer: "Every good deed helps imagination grow.",
    columns: 1,
    donorIds: [],
    active: true,
    givingProgramId: toySoldierProgram.id,
    templatePurpose: "good-deeds",
    palette: "brigade-sunshine",
    fontFamily: "Quicksand",
    showFrame: true,
    panels: portrait ? [
      { id: `${short}-heading`, type: "heading", title: "KINDNESS IS PART OF THE BRIGADE", size: "feature", x: 7, y: 5, width: 86, height: 10, fontFamily: "Cabin Sketch", fontSize: 33 },
      { id: `${short}-hero`, type: "message", eyebrow: "PLAY IT FORWARD", title: "What good deed will you add today?", body: "Generosity can be a gift, a helping hand, a warm welcome, or an idea shared with someone new.", size: "feature", x: 9, y: 18, width: 82, height: 25, fontSize: 27 },
      ...deedPanels.map((panel, index) => ({ id: `${short}-deed-${index}`, type: "message" as const, ...panel, size: "standard" as const, x: 10, y: 48 + index * 13, width: 80, height: 11, fontSize: 20 })),
      { id: `${short}-footer`, type: "footer", title: "Every good deed helps imagination grow.", size: "compact", x: 10, y: 90, width: 80, height: 5, fontSize: 14, footerIconPlacement: "both" }
    ] : [
      { id: `${short}-heading`, type: "heading", title: "KINDNESS IS PART OF THE BRIGADE", size: "feature", x: 5, y: 5, width: 90, height: 11, fontFamily: "Cabin Sketch", fontSize: 40 },
      { id: `${short}-hero`, type: "message", eyebrow: "PLAY IT FORWARD", title: "What good deed will you add today?", body: "Generosity can be a gift, a helping hand, a warm welcome, or an idea shared with someone new.", size: "feature", x: 8, y: 19, width: 84, height: 23, fontSize: 28 },
      ...deedPanels.map((panel, index) => ({ id: `${short}-deed-${index}`, type: "message" as const, ...panel, size: "standard" as const, x: 4 + index * 32, y: 48, width: 29, height: 28, fontSize: 19 })),
      { id: `${short}-footer`, type: "footer", title: "Every good deed helps imagination grow.", size: "compact", x: 12, y: 85, width: 76, height: 8, fontSize: 14, footerIconPlacement: "both" }
    ]
  };
}

function spotlightBoard(orientation: "Portrait" | "Landscape"): DonorBoardProgram {
  const portrait = orientation === "Portrait";
  const short = `spot-${portrait ? "p" : "l"}`;
  return {
    id: `board-supporter-spotlight-${orientation.toLowerCase()}`,
    name: `Supporter Spotlight · Gallery Portrait · ${orientation}`,
    orientation,
    heading: "SUPPORTER SPOTLIGHT",
    subtitle: "FRANCESCA VERA",
    description: "A champion for our children, exhibits, and mission.",
    footer: "Thank you for recognizing what the power of play can do for our children.",
    columns: 1,
    donorIds: ["toy-explorer-5"],
    active: true,
    givingProgramId: toySoldierProgram.id,
    templatePurpose: "story",
    palette: "brigade-cream",
    fontFamily: "Cormorant Garamond",
    showFrame: true,
    panels: portrait ? [
      { id: `${short}-heading`, type: "heading", title: "SUPPORTER SPOTLIGHT", size: "feature", x: 9, y: 5, width: 82, height: 8, fontFamily: "DM Sans", fontSize: 30 },
      { id: `${short}-portrait`, type: "image", title: "Supporter portrait", imageUrl: "/assets/donor-icons/supporter-spotlight-placeholder.png", imageFit: "cover", size: "feature", x: 10, y: 17, width: 30, height: 24 },
      { id: `${short}-intro`, type: "message", eyebrow: "A LIFE OF GENEROSITY", title: "Francesca Vera", body: "Financial donor · Power of Play Tour Ambassador · Luncheon Table Host", size: "feature", x: 43, y: 17, width: 47, height: 24, fontSize: 20 },
      { id: `${short}-story`, type: "message", eyebrow: "WEALTH · WISDOM · WORK", title: "A champion for the power of play", body: "Francesca supports the museum as a financial donor, including tribute gifts in memory of those who have passed away; a Power of Play Tour Ambassador; and a Table Host for the Every Day is Child’s Play Ask Event Luncheon.", size: "feature", x: 10, y: 45, width: 80, height: 37, fontFamily: "Libre Baskerville", fontSize: 19 },
      { id: `${short}-footer`, type: "footer", title: "WITH GRATITUDE.", size: "compact", x: 11, y: 89, width: 78, height: 6, fontFamily: "DM Sans", fontSize: 11 }
    ] : [
      { id: `${short}-heading`, type: "heading", title: "SUPPORTER SPOTLIGHT", size: "feature", x: 6, y: 6, width: 88, height: 9, fontFamily: "DM Sans", fontSize: 36 },
      { id: `${short}-portrait`, type: "image", title: "Supporter portrait", imageUrl: "/assets/donor-icons/supporter-spotlight-placeholder.png", imageFit: "cover", size: "feature", x: 6, y: 20, width: 23, height: 54 },
      { id: `${short}-story`, type: "message", eyebrow: "WEALTH · WISDOM · WORK", title: "Francesca Vera", body: "Francesca supports the museum as a financial donor, including tribute gifts in memory of those who have passed away; a Power of Play Tour Ambassador; and a Table Host for the Every Day is Child’s Play Ask Event Luncheon.", size: "feature", x: 34, y: 20, width: 60, height: 51, fontFamily: "Libre Baskerville", fontSize: 24 },
      { id: `${short}-footer`, type: "footer", title: "WITH GRATITUDE.", size: "compact", x: 12, y: 85, width: 76, height: 7, fontFamily: "DM Sans", fontSize: 12 }
    ]
  };
}

function partnershipSpotlightBoard(orientation: "Portrait" | "Landscape"): DonorBoardProgram {
  const portrait = orientation === "Portrait";
  const short = `partner-${portrait ? "p" : "l"}`;
  return {
    id: `board-supporter-spotlight-partnership-${orientation.toLowerCase()}`,
    name: `Supporter Spotlight · Partnership · ${orientation}`,
    orientation,
    heading: "A PARTNERSHIP FOR PLAY",
    subtitle: "FRANCESCA & JOHN VERA",
    description: "Explore Level · Toy Soldier Brigade · Class of 2026",
    footer: "Five years of pledged support for play, imagination, and discovery.",
    columns: 1,
    donorIds: ["toy-explorer-5"],
    active: true,
    givingProgramId: toySoldierProgram.id,
    templatePurpose: "story",
    palette: "classic",
    fontFamily: "Lora",
    showFrame: true,
    panels: portrait ? [
      { id: `${short}-heading`, type: "heading", title: "A PARTNERSHIP FOR PLAY", size: "feature", x: 9, y: 6, width: 82, height: 9, fontFamily: "Cinzel", fontSize: 30 },
      { id: `${short}-portrait`, type: "image", title: "Supporter photo", imageUrl: "/assets/donor-icons/supporter-spotlight-placeholder.png", imageFit: "cover", size: "feature", x: 22, y: 18, width: 56, height: 27 },
      { id: `${short}-supporters`, type: "supporters-heading", title: "WITH GRATITUDE", size: "compact", x: 13, y: 48, width: 74, height: 5, fontFamily: "DM Sans", fontSize: 12 },
      { id: `${short}-names`, type: "donors", title: "", size: "feature", columns: 1, rows: 1, donorIds: ["toy-explorer-5"], x: 13, y: 53, width: 74, height: 9, fontFamily: "Cormorant Garamond", fontSize: 30, donorDividerOpacity: 0 },
      { id: `${short}-pledge`, type: "message", eyebrow: "EXPLORE LEVEL · CLASS OF 2026", title: "$5,000 per year for five years", body: "A multi-year pledge of unrestricted funds helps keep play and imagination within reach for Stockton’s children.", size: "feature", x: 12, y: 64, width: 76, height: 21, fontFamily: "Libre Baskerville", fontSize: 22 },
      { id: `${short}-footer`, type: "footer", title: "With gratitude from the Children’s Museum of Stockton.", size: "compact", x: 10, y: 90, width: 80, height: 6, fontFamily: "DM Sans", fontSize: 12, footerIconPlacement: "both" }
    ] : [
      { id: `${short}-heading`, type: "heading", title: "A PARTNERSHIP FOR PLAY", size: "feature", x: 6, y: 6, width: 88, height: 10, fontFamily: "Cinzel", fontSize: 36 },
      { id: `${short}-portrait`, type: "image", title: "Supporter photo", imageUrl: "/assets/donor-icons/supporter-spotlight-placeholder.png", imageFit: "cover", size: "feature", x: 6, y: 21, width: 29, height: 53 },
      { id: `${short}-supporters`, type: "supporters-heading", title: "WITH GRATITUDE", size: "compact", x: 41, y: 21, width: 51, height: 5, fontFamily: "DM Sans", fontSize: 12 },
      { id: `${short}-names`, type: "donors", title: "", size: "feature", columns: 1, rows: 1, donorIds: ["toy-explorer-5"], x: 41, y: 26, width: 51, height: 12, fontFamily: "Cormorant Garamond", fontSize: 32, donorDividerOpacity: 0 },
      { id: `${short}-pledge`, type: "message", eyebrow: "EXPLORE LEVEL · CLASS OF 2026", title: "$5,000 per year for five years", body: "A multi-year pledge of unrestricted funds helps keep play and imagination within reach for Stockton’s children.", size: "feature", x: 40, y: 42, width: 53, height: 29, fontFamily: "Libre Baskerville", fontSize: 24 },
      { id: `${short}-footer`, type: "footer", title: "With gratitude from the Children’s Museum of Stockton.", size: "compact", x: 12, y: 85, width: 76, height: 7, fontFamily: "DM Sans", fontSize: 13, footerIconPlacement: "both" }
    ]
  };
}

function memberHonorBoard(orientation: "Portrait" | "Landscape"): DonorBoardProgram {
  const portrait = orientation === "Portrait";
  const short = `honor-${portrait ? "p" : "l"}`;
  return {
    id: `board-supporter-spotlight-member-honor-${orientation.toLowerCase()}`,
    name: `Supporter Spotlight · Member Honor · ${orientation}`,
    orientation,
    heading: "TOY SOLDIER BRIGADE",
    subtitle: "MEMBER HONOR",
    description: "A reusable recognition template for any Brigade member.",
    footer: "Steady support creates more room to imagine.",
    columns: 1,
    donorIds: ["toy-explorer-5"],
    active: true,
    givingProgramId: toySoldierProgram.id,
    templatePurpose: "story",
    palette: "brigade-blue",
    fontFamily: "Playfair Display",
    showFrame: true,
    panels: portrait ? [
      { id: `${short}-heading`, type: "heading", title: "TOY SOLDIER BRIGADE", size: "feature", x: 9, y: 6, width: 82, height: 8, fontFamily: "DM Sans", fontSize: 28 },
      { id: `${short}-honor`, type: "message", eyebrow: "CLASS OF 2026", title: "MEMBER HONOR", body: "We gratefully recognize a community champion whose five-year pledge helps sustain the power of play.", size: "feature", x: 12, y: 18, width: 76, height: 22, fontSize: 27 },
      { id: `${short}-mark`, type: "image", title: "Toy Soldier Brigade", imageUrl: "/assets/donor-icons/toy-soldier.png", imageFit: "contain", size: "standard", x: 35, y: 43, width: 30, height: 18 },
      { id: `${short}-supporters`, type: "supporters-heading", title: "HONORED MEMBER", size: "compact", x: 12, y: 64, width: 76, height: 5, fontFamily: "DM Sans", fontSize: 12 },
      { id: `${short}-names`, type: "donors", title: "", size: "feature", columns: 1, rows: 1, x: 12, y: 69, width: 76, height: 11, fontFamily: "Cormorant Garamond", fontSize: 31, donorDividerOpacity: 0 },
      { id: `${short}-footer`, type: "footer", title: "PLAY MADE POSSIBLE.", size: "compact", x: 12, y: 89, width: 76, height: 6, fontFamily: "DM Sans", fontSize: 11, footerIconPlacement: "both" }
    ] : [
      { id: `${short}-heading`, type: "heading", title: "TOY SOLDIER BRIGADE", size: "feature", x: 6, y: 6, width: 88, height: 9, fontFamily: "DM Sans", fontSize: 34 },
      { id: `${short}-honor`, type: "message", eyebrow: "CLASS OF 2026", title: "MEMBER HONOR", body: "We gratefully recognize a community champion whose five-year pledge helps sustain the power of play.", size: "feature", x: 6, y: 21, width: 31, height: 49, fontSize: 28 },
      { id: `${short}-mark`, type: "image", title: "Toy Soldier Brigade", imageUrl: "/assets/donor-icons/toy-soldier.png", imageFit: "contain", size: "standard", x: 41, y: 20, width: 17, height: 30 },
      { id: `${short}-supporters`, type: "supporters-heading", title: "HONORED MEMBER", size: "compact", x: 61, y: 22, width: 33, height: 7, fontFamily: "DM Sans", fontSize: 12 },
      { id: `${short}-names`, type: "donors", title: "", size: "feature", columns: 1, rows: 1, x: 61, y: 29, width: 33, height: 13, fontFamily: "Cormorant Garamond", fontSize: 31, donorDividerOpacity: 0 },
      { id: `${short}-message`, type: "message", eyebrow: "POLITE PHILANTHROPY", title: "Steady support. More room to imagine.", body: "Thank you for investing in children, discovery, and a museum where every family belongs.", size: "feature", x: 41, y: 49, width: 53, height: 22, fontFamily: "Libre Baskerville", fontSize: 20 },
      { id: `${short}-footer`, type: "footer", title: "With gratitude from the Children’s Museum of Stockton.", size: "compact", x: 12, y: 85, width: 76, height: 7, fontFamily: "DM Sans", fontSize: 12 }
    ]
  };
}

export const brigadeBoardPrograms: DonorBoardProgram[] = [
  fullRosterBoard("Portrait"),
  fullRosterBoard("Landscape"),
  levelBoard("Explore", "Portrait"),
  levelBoard("Explore", "Landscape"),
  levelBoard("Play", "Portrait"),
  levelBoard("Play", "Landscape"),
  aboutBoard("Portrait"),
  aboutBoard("Landscape"),
  goodDeedsBoard("Portrait"),
  goodDeedsBoard("Landscape"),
  spotlightBoard("Portrait"),
  spotlightBoard("Landscape"),
  partnershipSpotlightBoard("Portrait"),
  partnershipSpotlightBoard("Landscape"),
  memberHonorBoard("Portrait"),
  memberHonorBoard("Landscape")
];

const announcementBase = {
  target: "all" as const,
  priority: "Normal" as const,
  durationMinutes: 3,
  timerStyle: "off" as const,
  timerPosition: "announcement-right" as const,
  timerAccentColor: "#f0b642",
  timerTrackColor: "#e9dcc4",
  finishSfx: "off" as const,
  sfxVolume: 55,
  character: "off" as const
};

export const brigadeAnnouncements: SavedAnnouncement[] = [
  { ...announcementBase, id: "brigade-welcome-class", title: "Welcome, Class of 2026", message: "Meet the Toy Soldier Brigade—community champions making five-year commitments to sustain play, imagination, and discovery.", details: "With gratitude from the Children's Museum of Stockton.", style: "Temporary Card", textColor: "#173f61", backgroundColor: "#f8f0de" },
  { ...announcementBase, id: "brigade-new-member", title: "A New Friend Joins the Brigade", message: "Welcome, [Supporter name]! Your five-year pledge helps keep play and possibility at the heart of our community.", style: "Ribbon", textColor: "#ffffff", backgroundColor: "#1675a8" },
  { ...announcementBase, id: "brigade-explore-thanks", title: "Explore Level Gratitude", message: "Explore Level members pledge $5,000 each year for five years in unrestricted support. We are honored to recognize [Supporter name].", style: "Lower Third", textColor: "#ffffff", backgroundColor: "#106b9a" },
  { ...announcementBase, id: "brigade-play-thanks", title: "Play Level Gratitude", message: "Play Level members pledge $1,000 each year for five years in unrestricted support. Thank you, [Supporter name], for standing with Stockton's children.", style: "Lower Third", textColor: "#ffffff", backgroundColor: "#b9382b" },
  { ...announcementBase, id: "brigade-join", title: "Join the Toy Soldier Brigade", message: "Make a five-year pledge and help sustain the power of play.", details: "Contact Edward Figueroa at 209-465-4392 · childrensmuseumstockton.org", style: "Temporary Card", textColor: "#173f61", backgroundColor: "#f4c45d", durationMinutes: 5 },
  { ...announcementBase, id: "brigade-good-deed", title: "Play It Forward", message: "Kindness, service, and generosity help imagination grow. What good deed will you add today?", style: "Ribbon", textColor: "#173f61", backgroundColor: "#f4c45d" },
  { ...announcementBase, id: "brigade-spotlight-francesca", title: "Supporter Spotlight · Francesca Vera", message: "Thank you for championing our children, our exhibits, and our mission.", details: "Donor · Power of Play Tour Ambassador · Luncheon Table Host", style: "Temporary Card", textColor: "#173f61", backgroundColor: "#f8f0de", durationMinutes: 4 },
  { ...announcementBase, id: "brigade-museum-news", title: "Museum News", message: "The Toy Soldier Brigade is helping play, imagination, and discovery grow for Stockton’s children.", details: "Ask a museum team member how to join the Class of 2026.", style: "News Ticker", tickerSpeed: "standard", tickerDirection: "left", textColor: "#fff6df", backgroundColor: "#103f68", durationMinutes: 5 }
];

export const brigadeBlips: SavedBlip[] = [
  { id: "blip-brigade-kindness", name: "Kindness Spotted", kind: "celebration", headline: "KINDNESS SPOTTED!", prompt: "A museum friend found a way to help.", subtext: "Good deeds help imagination grow.", target: "all", durationMinutes: 2, countdownSeconds: 0, showCountdown: false, ticking: false, startSfx: "bell", revealSfx: "applause", sfxVolume: 55, backgroundColor: "#0d608a", accentColor: "#f4c45d", motion: "pop" },
  { id: "blip-brigade-helping-hand", name: "Helping Hand Shout-Out", kind: "celebration", headline: "A HELPING HAND!", prompt: "Someone made the museum more welcoming today.", subtext: "Thank you for playing it forward.", target: "all", durationMinutes: 2, countdownSeconds: 0, showCountdown: false, ticking: false, startSfx: "bell", revealSfx: "applause", sfxVolume: 50, backgroundColor: "#9f3025", accentColor: "#f8e6b7", motion: "gentle" },
  { id: "blip-brigade-new-friend", name: "New Brigade Friend", kind: "celebration", headline: "WELCOME TO THE BRIGADE!", prompt: "[Supporter name] is helping the power of play grow.", subtext: "Toy Soldier Brigade · Class of 2026", target: "all", durationMinutes: 2, countdownSeconds: 0, showCountdown: false, ticking: false, startSfx: "level-up", revealSfx: "applause", sfxVolume: 60, backgroundColor: "#103f68", accentColor: "#f4c45d", motion: "pop" },
  { id: "blip-brigade-good-deed", name: "Good Deed Challenge", kind: "quiz", headline: "PLAY IT FORWARD", prompt: "What kind thing can you do for someone else today?", answer: "Every helping hand counts!", subtext: "Think of one good deed before time runs out.", target: "all", durationMinutes: 2, countdownSeconds: 10, showCountdown: true, ticking: false, startSfx: "bell", revealSfx: "applause", sfxVolume: 45, backgroundColor: "#d99005", accentColor: "#173f61", motion: "slide" }
];

const LOCAL_DEMO_USER_CREATED_AT = "2026-08-06T00:00:00.000Z";

export const localDemoUsers: LanternState["users"] = [
  { id: "user-felix", name: "Felix", createdAt: LOCAL_DEMO_USER_CREATED_AT, updatedAt: LOCAL_DEMO_USER_CREATED_AT, accessMode: "local-demo" },
  { id: "user-codex", name: "Codex", createdAt: LOCAL_DEMO_USER_CREATED_AT, updatedAt: LOCAL_DEMO_USER_CREATED_AT, accessMode: "local-demo" },
  { id: "user-edward", name: "Edward", createdAt: LOCAL_DEMO_USER_CREATED_AT, updatedAt: LOCAL_DEMO_USER_CREATED_AT, accessMode: "local-demo" }
];

export const defaultUserPreferences: LanternState["userPreferences"] = localDemoUsers.map((user) => ({
  userId: user.id,
  theme: "warm",
  donorSort: "manual",
  lastDisplayId: "display-1",
  lastScheduleDisplay: "all",
  lastBoardId: "board-toy-soldier-portrait",
  roomWindows: {},
  roomMirrorByDisplay: {},
  editor: {
    scheduleView: "week",
    liveTab: "setup",
    directMode: "frame"
  }
}));

export const initialState: LanternState = {
  contentVersion: LANTERN_CONTENT_VERSION,
  revision: 19,
  publishedAt: "Class of 2026 launch",
  nextScheduledEvent: "Toy Soldier Brigade recognition at 9:00 AM",
  lastBackup: "Ready for museum review",
  donors: [...officialDonors, ...legacyDonors],
  users: localDemoUsers,
  userPreferences: defaultUserPreferences,
  auditHistory: [],
  broadcastReminderAcknowledgements: [],
  visitorMessages: seededVisitorMessages.map((message) => ({ ...message })),
  visitorMessageRotation: { bag: [], recentIds: [] },
  givingPrograms: [toySoldierProgram],
  donorGroups: [
    { id: "group-toy-explore", name: "Explore Level", color: "#1675a8" },
    { id: "group-toy-play", name: "Play Level", color: "#c74432" }
  ],
  recognitionSettings: {
    tiers: ["Explore", "Play"],
    categories: ["Giving Society", "Family", "Individual", "Corporate", "Community", "Legacy"],
    tags: ["Toy Soldier Brigade", "Class of 2026", "Explore Level", "Play Level", "Five-year pledge", "Legacy"],
    appearance: "warm"
  },
  theme: {
    material: "Deep Navy Enamel",
    finish: "Matte",
    lettering: "Painted",
    trim: "Brass",
    warmth: 64,
    grain: 24,
    letteringDepth: 22,
    shadowSoftness: 70,
    motion: 18
  },
  board: {
    presetName: "Toy Soldier Brigade · Museum Edition",
    visualStyle: "museum",
    donorColumns: 2,
    portraitHeading: "TOY SOLDIER BRIGADE",
    portraitSubtitle: "CLASS OF 2026",
    portraitDescription: toySoldierProgram.description,
    portraitFooter: "WITH GRATITUDE TO OUR COMMUNITY.",
    landscapeHeadingPrimary: "PLAY IT",
    landscapeHeadingAccent: "FORWARD",
    landscapeSubtitle: "THANK YOU TO OUR TOY SOLDIER BRIGADE",
    storyEyebrow: "POWER OF PLAY",
    storyTitle: "Wonder grows here.",
    storyBody: toySoldierProgram.impactStatement,
    storyImageUrl: "",
    hoursLabel: "LEARN MORE",
    hoursValue: "209-465-4392",
    impactLines: ["PLAY", "IMAGINATION", "COMMUNITY"],
    theaterLabel: "TOY SOLDIER BRIGADE",
    theaterValue: "Five years of pledged support",
    membershipLabel: "JOIN THE BRIGADE",
    membershipValue: "Make a lasting impact",
    socialLabel: "VISIT",
    socialValue: "childrensmuseumstockton.org",
    footerVisibility: { portraitHours: true, portraitImpact: true, landscapeTheater: true, landscapeHours: true, landscapeMembership: true, landscapeSocial: true }
  },
  boardPrograms: [...brigadeBoardPrograms, ...legacyBoardPrograms, ...generousDonorBoardPrograms],
  schedules: createPhase3DemoSchedule(),
  savedAnnouncements: [...brigadeAnnouncements, ...phase3Announcements],
  announcement: { ...brigadeAnnouncements[0], active: false },
  savedBlips: brigadeBlips,
  activeBlip: { ...brigadeBlips[0], active: false },
  live: {
    active: false,
    target: "display-1",
    title: "The Power of Play",
    lowerThird: "Children's Museum of Stockton",
    titlePosition: { x: 26, y: 18 },
    lowerThirdPosition: { x: 38, y: 24 },
    backgroundMode: "board",
    backgroundColor: "#07111e",
    backgroundImage: undefined,
    panelColor: "#050d17",
    frameBorderColor: "#f4c45d",
    frameBorderWidth: 0,
    usingCamera: true,
    source: "camera",
    frame: { x: 24, y: 13, width: 65, height: 80, crop: { scale: 1.4, x: 6, y: -34 }, maskShape: "rectangle", rotation: -1, mirrorX: false },
    chromaKey: { enabled: false, color: "#18a558", similarity: 0.34, smoothness: 0.12, spill: 0.18 },
    effects: { background: "original", blur: 18, segmentationThreshold: 0.42, segmentationFeather: 0.18, accessory: "none", glassesEnabled: false, glassesStyle: "classic", partyHatEnabled: false, hatEnabled: false, hatStyle: "party", wizardSpringiness: .56, wizardDamping: .7, faceTracking: false, puppetPreview: false, trackingDebug: false, trackedPointsOverlay: false, trackingCameraUnderlay: false, costumeEnabled: false, costumeId: "costume-talking-teddy" }
  },
  effectStudio: {
    costumes: seededCostumes.map((costume) => structuredClone(costume)),
    calibrationProfiles: [],
    activeCalibrationByUserDevice: {}
  },
  screens: {
    "display-1": {
      id: "display-1", label: "Welcome Gallery", orientation: "Portrait", resolution: "1080 x 1920", assignment: "Legacy donor star wall", style: "donor-wall",
      backgroundCrop: { scale: 1, x: 0, y: 0 }, layoutScale: 100, brightness: 78, currentRevision: 19, renderer: "WebGL2", quality: "Balanced",
      boardProgramId: "board-legacy-stars-photo-1", donorIds: [], donorRosterConfigured: false, customHeading: "", customSubheading: "", fontFamily: "DM Sans", nameSize: 30, columns: 2,
      donorScrollEnabled: false, donorScrollSpeed: 4, particleAnimationEnabled: false, particleDriftDirection: "natural", particleDriftSpeed: 3, particleGravity: 3, showIcons: false, donorIconStyle: "circle", donorIconPlacement: "left", showSubtext: false, showFrame: true
    },
    "display-2": {
      id: "display-2", label: "Discovery Hall", orientation: "Landscape", resolution: "1920 x 1080", assignment: "Legacy donor star wall", style: "donor-wall",
      backgroundCrop: { scale: 1, x: 0, y: 0 }, layoutScale: 100, brightness: 78, currentRevision: 19, renderer: "WebGL2", quality: "Showcase",
      boardProgramId: "board-legacy-stars-photo-2", donorIds: [], donorRosterConfigured: false, customHeading: "", customSubheading: "", fontFamily: "DM Sans", nameSize: 28, columns: 2,
      donorScrollEnabled: false, donorScrollSpeed: 4, particleAnimationEnabled: false, particleDriftDirection: "natural", particleDriftSpeed: 3, particleGravity: 3, showIcons: false, donorIconStyle: "circle", donorIconPlacement: "left", showSubtext: false, showFrame: true
    }
  },
  revisions: [
    { id: 19, note: "Toy Soldier Brigade Class of 2026 museum launch", author: "Codex", publishedAt: "Museum review build", portraitReady: true, landscapeReady: true },
    { id: 18, note: "Walnut donor wall with story-time schedule", author: "Lantern Host", publishedAt: "Previous revision", portraitReady: true, landscapeReady: true }
  ]
};
