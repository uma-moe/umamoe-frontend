export type Interval = [number, number];
export type Style = 1 | 2 | 3 | 4 | 5 | 6;
export type TeamMatcher = { card?: number; chara?: number; style?: number };
export type Requirement = TeamMatcher & { exclude?: boolean; anyOf?: TeamMatcher[] };
export type Card = { chara: number; name: string; outfit: string; sourceName?: string; sourceOutfit?: string };
export type TeamRate = {
    key: string; name: string; owners: number; teamExposures: number; teamWins: number;
    team: number; teamAdjusted: number; teamCI: Interval; teamPop: number;
};
export type RunnerRate = TeamRate & {
    runners: number; runnerExposures: number; individualWins: number;
    individual: number; individualAdjusted: number; individualCI: Interval;
    pop: number; winShare: number;
};
export type Pair = RunnerRate & {
    card: number; chara: number; style: Style; outfit: string; stylePop: number;
    evaluatedTeams: number; evaluatedOwners: number;
};
export type SaturationBucket = {
    x: number; rate: number; wins: number; entries: number; races: number; ci: Interval; supported: boolean;
};
export type SnapshotMeta = {
    populationRaces: number; populationOwners: number; appearancesPerOwner: number;
    populationBlocks: number; window: string; course: string; conditions: string;
    capturedThrough?: string;
    courseSurface?: 'Turf' | 'Dirt'; courseDistance?: 'Sprint' | 'Mile' | 'Medium' | 'Long';
    cumulativeSimulations: number; evaluatedTeams: number; evaluatedOwners: number; debufferThreshold: number;
    minimumEvaluationPerTeam?: number; screeningRaces?: number; evaluationRaces?: number;
    baseEvaluationRaces?: number; performerObservations?: number;
    competitiveMixtureRaces?: number; competitiveMixtureTeamObservations?: number;
    analysisCorpus?: 'owner-weighted-competitive-mixture'; sharedAnalysisCorpus?: boolean;
};
export type Snapshot = {
    schemaVersion: 1; snapshotId: string; cmId: string; label: string;
    raceInstanceId?: number; startTimeType?: number;
    skillAnalysis?: { schemaVersion: number };
    sourceSha256: string; engineSha256: string; meta: SnapshotMeta;
};
export type Summary = {
    snapshotId: string; meta: SnapshotMeta; cards: Record<number, Card>;
    styles: (RunnerRate & { style: Style })[]; pairs: Pair[]; archetypes: TeamRate[];
    saturation: Record<number, SaturationBucket[]>;
    fieldSaturation: Record<number, Record<number, SaturationBucket[]>>;
    rooms: { rows: { counts: number[]; races: number; frequency: number }[]; average: number[]; noDisplayedFront: number };
    storage?: { performerIndex: string; teamShards: boolean };
};
export type Runner = {
    id: string; card: number; chara: number; style: Style; racingStyle: number; score: number;
    stats?: [number, number, number, number, number]; skills?: [number, number][];
    deck?: { position: number; id: number; lb: number; exp: number }[];
    parents?: { positionId: number; cardId: number; rank: number; factors: { id: number; level: number }[] }[];
};
export type Build = Runner & {
    stats: [number, number, number, number, number]; aptitudes: [string, string, string];
    skills: [number, number][]; trainedIds: string[];
};
export type Performer = {
    id: string; owner: { id: string; names: string[] }; members: Runner[];
    wins: number; n: number; ci: Interval; memberWins: number[]; archiveIndex?: number;
};
export type PerformerIndex = { snapshotId: string; teams: Performer[] };
export type TeamSearchResponse = {
    snapshotId: string; totalTeams: number; totalOwners: number; teams: Performer[];
};
export type TeamDistributionResponse = {
    snapshotId: string; totalTeams: number; median: number | null; topDecile: number | null;
    bins: { index: number; count: number; observedMin: number; observedMax: number }[];
};
export type LobbyEditorCatalog = { snapshotId: string; cards: number[]; skills: number[] };
export type CompactPerformerIndex = {
    snapshotId: string; format: 2 | 3; builds: [number, number, number, number, number][];
    // Format 3 carries the simulator-resolvable team IDs while retaining the
    // compact row order used to locate static detail shards.
    teamIds?: string[];
    // owner, three build indices, appearances, three member win counts
    teams: [number, number, number, number, number, number, number, number][];
};
export type Coverage = { snapshotId: string; signatures: [number, number, number, number, number][] };
export type TeamDetail = { snapshotId: string; team: Omit<Performer, 'members'> & { members: Build[] }; skills: Record<number, string>; skillIcons?: Record<number, number> };
export type TeamShard = { snapshotId: string; teams: Record<string, TeamDetail['team']>; skills: Record<number, string>; skillIcons: Record<number, number> };
export type Contexts = { snapshotId: string; pair: string; rows: TeamRate[] };


