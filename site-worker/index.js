/** Public observed-results API. No model, polling or research services are exposed. */
const STATE_ROWS = `AL|01|Alabama
AK|02|Alaska
AZ|04|Arizona
AR|05|Arkansas
CA|06|California
CO|08|Colorado
CT|09|Connecticut
DE|10|Delaware
FL|12|Florida
GA|13|Georgia
HI|15|Hawaii
ID|16|Idaho
IL|17|Illinois
IN|18|Indiana
IA|19|Iowa
KS|20|Kansas
KY|21|Kentucky
LA|22|Louisiana
ME|23|Maine
MD|24|Maryland
MA|25|Massachusetts
MI|26|Michigan
MN|27|Minnesota
MS|28|Mississippi
MO|29|Missouri
MT|30|Montana
NE|31|Nebraska
NV|32|Nevada
NH|33|New Hampshire
NJ|34|New Jersey
NM|35|New Mexico
NY|36|New York
NC|37|North Carolina
ND|38|North Dakota
OH|39|Ohio
OK|40|Oklahoma
OR|41|Oregon
PA|42|Pennsylvania
RI|44|Rhode Island
SC|45|South Carolina
SD|46|South Dakota
TN|47|Tennessee
TX|48|Texas
UT|49|Utah
VT|50|Vermont
VA|51|Virginia
WA|53|Washington
WV|54|West Virginia
WI|55|Wisconsin
WY|56|Wyoming`;
export const STATES = Object.fromEntries(STATE_ROWS.split('\n').map((line) => {
  const [state, fips, name] = line.split('|'); return [state, { state, fips, name }];
}));
// Massachusetts CNN detail is municipal, not county geography. Generated from
// the authoritative MassGIS351-municipality TOWN/FIPS_STCO table. Keep this
// standalone normalizer usable in both Node and the built browser module.
export const MA_TOWN_CROSSWALK_SOURCE = Object.freeze({"name":"MassGIS Massachusetts Municipalities Areas","url":"https://services1.arcgis.com/hGdibHYSPO59RG1h/ArcGIS/rest/services/Massachusetts_Municipalities/FeatureServer/1/query?where=1%3D1&outFields=TOWN%2CTOWN_ID%2CCOUNTY%2CFIPS_STCO&returnGeometry=false&returnDistinctValues=true&orderByFields=TOWN_ID&f=json","documentation_url":"https://www.mass.gov/info-details/massgis-data-municipalities","retrieved_at":"2026-11-04T22:21:23.069350+00:00","sha256":"706c1c63e38c08d2667861bbdc3cfd21323c256a65d072b652546de8799a6250","fields":["TOWN","TOWN_ID","COUNTY","FIPS_STCO"],"capture_format":"original_response_bytes"});
const MA_TOWN_COUNTY_ROWS = `ABINGTON|1|25023|Plymouth County
ACTON|2|25017|Middlesex County
ACUSHNET|3|25005|Bristol County
ADAMS|4|25003|Berkshire County
AGAWAM|5|25013|Hampden County
ALFORD|6|25003|Berkshire County
AMESBURY|7|25009|Essex County
AMHERST|8|25015|Hampshire County
ANDOVER|9|25009|Essex County
ARLINGTON|10|25017|Middlesex County
ASHBURNHAM|11|25027|Worcester County
ASHBY|12|25017|Middlesex County
ASHFIELD|13|25011|Franklin County
ASHLAND|14|25017|Middlesex County
ATHOL|15|25027|Worcester County
ATTLEBORO|16|25005|Bristol County
AUBURN|17|25027|Worcester County
AVON|18|25021|Norfolk County
AYER|19|25017|Middlesex County
BARNSTABLE|20|25001|Barnstable County
BARRE|21|25027|Worcester County
BECKET|22|25003|Berkshire County
BEDFORD|23|25017|Middlesex County
BELCHERTOWN|24|25015|Hampshire County
BELLINGHAM|25|25021|Norfolk County
BELMONT|26|25017|Middlesex County
BERKLEY|27|25005|Bristol County
BERLIN|28|25027|Worcester County
BERNARDSTON|29|25011|Franklin County
BEVERLY|30|25009|Essex County
BILLERICA|31|25017|Middlesex County
BLACKSTONE|32|25027|Worcester County
BLANDFORD|33|25013|Hampden County
BOLTON|34|25027|Worcester County
BOSTON|35|25025|Suffolk County
BOURNE|36|25001|Barnstable County
BOXBOROUGH|37|25017|Middlesex County
BOXFORD|38|25009|Essex County
BOYLSTON|39|25027|Worcester County
BRAINTREE|40|25021|Norfolk County
BREWSTER|41|25001|Barnstable County
BRIDGEWATER|42|25023|Plymouth County
BRIMFIELD|43|25013|Hampden County
BROCKTON|44|25023|Plymouth County
BROOKFIELD|45|25027|Worcester County
BROOKLINE|46|25021|Norfolk County
BUCKLAND|47|25011|Franklin County
BURLINGTON|48|25017|Middlesex County
CAMBRIDGE|49|25017|Middlesex County
CANTON|50|25021|Norfolk County
CARLISLE|51|25017|Middlesex County
CARVER|52|25023|Plymouth County
CHARLEMONT|53|25011|Franklin County
CHARLTON|54|25027|Worcester County
CHATHAM|55|25001|Barnstable County
CHELMSFORD|56|25017|Middlesex County
CHELSEA|57|25025|Suffolk County
CHESHIRE|58|25003|Berkshire County
CHESTER|59|25013|Hampden County
CHESTERFIELD|60|25015|Hampshire County
CHICOPEE|61|25013|Hampden County
CHILMARK|62|25007|Dukes County
CLARKSBURG|63|25003|Berkshire County
CLINTON|64|25027|Worcester County
COHASSET|65|25021|Norfolk County
COLRAIN|66|25011|Franklin County
CONCORD|67|25017|Middlesex County
CONWAY|68|25011|Franklin County
CUMMINGTON|69|25015|Hampshire County
DALTON|70|25003|Berkshire County
DANVERS|71|25009|Essex County
DARTMOUTH|72|25005|Bristol County
DEDHAM|73|25021|Norfolk County
DEERFIELD|74|25011|Franklin County
DENNIS|75|25001|Barnstable County
DIGHTON|76|25005|Bristol County
DOUGLAS|77|25027|Worcester County
DOVER|78|25021|Norfolk County
DRACUT|79|25017|Middlesex County
DUDLEY|80|25027|Worcester County
DUNSTABLE|81|25017|Middlesex County
DUXBURY|82|25023|Plymouth County
EAST BRIDGEWATER|83|25023|Plymouth County
EAST BROOKFIELD|84|25027|Worcester County
EAST LONGMEADOW|85|25013|Hampden County
EASTHAM|86|25001|Barnstable County
EASTHAMPTON|87|25015|Hampshire County
EASTON|88|25005|Bristol County
EDGARTOWN|89|25007|Dukes County
EGREMONT|90|25003|Berkshire County
ERVING|91|25011|Franklin County
ESSEX|92|25009|Essex County
EVERETT|93|25017|Middlesex County
FAIRHAVEN|94|25005|Bristol County
FALL RIVER|95|25005|Bristol County
FALMOUTH|96|25001|Barnstable County
FITCHBURG|97|25027|Worcester County
FLORIDA|98|25003|Berkshire County
FOXBOROUGH|99|25021|Norfolk County
FRAMINGHAM|100|25017|Middlesex County
FRANKLIN|101|25021|Norfolk County
FREETOWN|102|25005|Bristol County
GARDNER|103|25027|Worcester County
AQUINNAH|104|25007|Dukes County
GEORGETOWN|105|25009|Essex County
GILL|106|25011|Franklin County
GLOUCESTER|107|25009|Essex County
GOSHEN|108|25015|Hampshire County
GOSNOLD|109|25007|Dukes County
GRAFTON|110|25027|Worcester County
GRANBY|111|25015|Hampshire County
GRANVILLE|112|25013|Hampden County
GREAT BARRINGTON|113|25003|Berkshire County
GREENFIELD|114|25011|Franklin County
GROTON|115|25017|Middlesex County
GROVELAND|116|25009|Essex County
HADLEY|117|25015|Hampshire County
HALIFAX|118|25023|Plymouth County
HAMILTON|119|25009|Essex County
HAMPDEN|120|25013|Hampden County
HANCOCK|121|25003|Berkshire County
HANOVER|122|25023|Plymouth County
HANSON|123|25023|Plymouth County
HARDWICK|124|25027|Worcester County
HARVARD|125|25027|Worcester County
HARWICH|126|25001|Barnstable County
HATFIELD|127|25015|Hampshire County
HAVERHILL|128|25009|Essex County
HAWLEY|129|25011|Franklin County
HEATH|130|25011|Franklin County
HINGHAM|131|25023|Plymouth County
HINSDALE|132|25003|Berkshire County
HOLBROOK|133|25021|Norfolk County
HOLDEN|134|25027|Worcester County
HOLLAND|135|25013|Hampden County
HOLLISTON|136|25017|Middlesex County
HOLYOKE|137|25013|Hampden County
HOPEDALE|138|25027|Worcester County
HOPKINTON|139|25017|Middlesex County
HUBBARDSTON|140|25027|Worcester County
HUDSON|141|25017|Middlesex County
HULL|142|25023|Plymouth County
HUNTINGTON|143|25015|Hampshire County
IPSWICH|144|25009|Essex County
KINGSTON|145|25023|Plymouth County
LAKEVILLE|146|25023|Plymouth County
LANCASTER|147|25027|Worcester County
LANESBOROUGH|148|25003|Berkshire County
LAWRENCE|149|25009|Essex County
LEE|150|25003|Berkshire County
LEICESTER|151|25027|Worcester County
LENOX|152|25003|Berkshire County
LEOMINSTER|153|25027|Worcester County
LEVERETT|154|25011|Franklin County
LEXINGTON|155|25017|Middlesex County
LEYDEN|156|25011|Franklin County
LINCOLN|157|25017|Middlesex County
LITTLETON|158|25017|Middlesex County
LONGMEADOW|159|25013|Hampden County
LOWELL|160|25017|Middlesex County
LUDLOW|161|25013|Hampden County
LUNENBURG|162|25027|Worcester County
LYNN|163|25009|Essex County
LYNNFIELD|164|25009|Essex County
MALDEN|165|25017|Middlesex County
MANCHESTER-BY-THE-SEA|166|25009|Essex County
MANSFIELD|167|25005|Bristol County
MARBLEHEAD|168|25009|Essex County
MARION|169|25023|Plymouth County
MARLBOROUGH|170|25017|Middlesex County
MARSHFIELD|171|25023|Plymouth County
MASHPEE|172|25001|Barnstable County
MATTAPOISETT|173|25023|Plymouth County
MAYNARD|174|25017|Middlesex County
MEDFIELD|175|25021|Norfolk County
MEDFORD|176|25017|Middlesex County
MEDWAY|177|25021|Norfolk County
MELROSE|178|25017|Middlesex County
MENDON|179|25027|Worcester County
MERRIMAC|180|25009|Essex County
METHUEN|181|25009|Essex County
MIDDLEBOROUGH|182|25023|Plymouth County
MIDDLEFIELD|183|25015|Hampshire County
MIDDLETON|184|25009|Essex County
MILFORD|185|25027|Worcester County
MILLBURY|186|25027|Worcester County
MILLIS|187|25021|Norfolk County
MILLVILLE|188|25027|Worcester County
MILTON|189|25021|Norfolk County
MONROE|190|25011|Franklin County
MONSON|191|25013|Hampden County
MONTAGUE|192|25011|Franklin County
MONTEREY|193|25003|Berkshire County
MONTGOMERY|194|25013|Hampden County
MOUNT WASHINGTON|195|25003|Berkshire County
NAHANT|196|25009|Essex County
NANTUCKET|197|25019|Nantucket County
NATICK|198|25017|Middlesex County
NEEDHAM|199|25021|Norfolk County
NEW ASHFORD|200|25003|Berkshire County
NEW BEDFORD|201|25005|Bristol County
NEW BRAINTREE|202|25027|Worcester County
NEW MARLBOROUGH|203|25003|Berkshire County
NEW SALEM|204|25011|Franklin County
NEWBURY|205|25009|Essex County
NEWBURYPORT|206|25009|Essex County
NEWTON|207|25017|Middlesex County
NORFOLK|208|25021|Norfolk County
NORTH ADAMS|209|25003|Berkshire County
NORTH ANDOVER|210|25009|Essex County
NORTH ATTLEBOROUGH|211|25005|Bristol County
NORTH BROOKFIELD|212|25027|Worcester County
NORTH READING|213|25017|Middlesex County
NORTHAMPTON|214|25015|Hampshire County
NORTHBOROUGH|215|25027|Worcester County
NORTHBRIDGE|216|25027|Worcester County
NORTHFIELD|217|25011|Franklin County
NORTON|218|25005|Bristol County
NORWELL|219|25023|Plymouth County
NORWOOD|220|25021|Norfolk County
OAK BLUFFS|221|25007|Dukes County
OAKHAM|222|25027|Worcester County
ORANGE|223|25011|Franklin County
ORLEANS|224|25001|Barnstable County
OTIS|225|25003|Berkshire County
OXFORD|226|25027|Worcester County
PALMER|227|25013|Hampden County
PAXTON|228|25027|Worcester County
PEABODY|229|25009|Essex County
PELHAM|230|25015|Hampshire County
PEMBROKE|231|25023|Plymouth County
PEPPERELL|232|25017|Middlesex County
PERU|233|25003|Berkshire County
PETERSHAM|234|25027|Worcester County
PHILLIPSTON|235|25027|Worcester County
PITTSFIELD|236|25003|Berkshire County
PLAINFIELD|237|25015|Hampshire County
PLAINVILLE|238|25021|Norfolk County
PLYMOUTH|239|25023|Plymouth County
PLYMPTON|240|25023|Plymouth County
PRINCETON|241|25027|Worcester County
PROVINCETOWN|242|25001|Barnstable County
QUINCY|243|25021|Norfolk County
RANDOLPH|244|25021|Norfolk County
RAYNHAM|245|25005|Bristol County
READING|246|25017|Middlesex County
REHOBOTH|247|25005|Bristol County
REVERE|248|25025|Suffolk County
RICHMOND|249|25003|Berkshire County
ROCHESTER|250|25023|Plymouth County
ROCKLAND|251|25023|Plymouth County
ROCKPORT|252|25009|Essex County
ROWE|253|25011|Franklin County
ROWLEY|254|25009|Essex County
ROYALSTON|255|25027|Worcester County
RUSSELL|256|25013|Hampden County
RUTLAND|257|25027|Worcester County
SALEM|258|25009|Essex County
SALISBURY|259|25009|Essex County
SANDISFIELD|260|25003|Berkshire County
SANDWICH|261|25001|Barnstable County
SAUGUS|262|25009|Essex County
SAVOY|263|25003|Berkshire County
SCITUATE|264|25023|Plymouth County
SEEKONK|265|25005|Bristol County
SHARON|266|25021|Norfolk County
SHEFFIELD|267|25003|Berkshire County
SHELBURNE|268|25011|Franklin County
SHERBORN|269|25017|Middlesex County
SHIRLEY|270|25017|Middlesex County
SHREWSBURY|271|25027|Worcester County
SHUTESBURY|272|25011|Franklin County
SOMERSET|273|25005|Bristol County
SOMERVILLE|274|25017|Middlesex County
SOUTH HADLEY|275|25015|Hampshire County
SOUTHAMPTON|276|25015|Hampshire County
SOUTHBOROUGH|277|25027|Worcester County
SOUTHBRIDGE|278|25027|Worcester County
SOUTHWICK|279|25013|Hampden County
SPENCER|280|25027|Worcester County
SPRINGFIELD|281|25013|Hampden County
STERLING|282|25027|Worcester County
STOCKBRIDGE|283|25003|Berkshire County
STONEHAM|284|25017|Middlesex County
STOUGHTON|285|25021|Norfolk County
STOW|286|25017|Middlesex County
STURBRIDGE|287|25027|Worcester County
SUDBURY|288|25017|Middlesex County
SUNDERLAND|289|25011|Franklin County
SUTTON|290|25027|Worcester County
SWAMPSCOTT|291|25009|Essex County
SWANSEA|292|25005|Bristol County
TAUNTON|293|25005|Bristol County
TEMPLETON|294|25027|Worcester County
TEWKSBURY|295|25017|Middlesex County
TISBURY|296|25007|Dukes County
TOLLAND|297|25013|Hampden County
TOPSFIELD|298|25009|Essex County
TOWNSEND|299|25017|Middlesex County
TRURO|300|25001|Barnstable County
TYNGSBOROUGH|301|25017|Middlesex County
TYRINGHAM|302|25003|Berkshire County
UPTON|303|25027|Worcester County
UXBRIDGE|304|25027|Worcester County
WAKEFIELD|305|25017|Middlesex County
WALES|306|25013|Hampden County
WALPOLE|307|25021|Norfolk County
WALTHAM|308|25017|Middlesex County
WARE|309|25015|Hampshire County
WAREHAM|310|25023|Plymouth County
WARREN|311|25027|Worcester County
WARWICK|312|25011|Franklin County
WASHINGTON|313|25003|Berkshire County
WATERTOWN|314|25017|Middlesex County
WAYLAND|315|25017|Middlesex County
WEBSTER|316|25027|Worcester County
WELLESLEY|317|25021|Norfolk County
WELLFLEET|318|25001|Barnstable County
WENDELL|319|25011|Franklin County
WENHAM|320|25009|Essex County
WEST BOYLSTON|321|25027|Worcester County
WEST BRIDGEWATER|322|25023|Plymouth County
WEST BROOKFIELD|323|25027|Worcester County
WEST NEWBURY|324|25009|Essex County
WEST SPRINGFIELD|325|25013|Hampden County
WEST STOCKBRIDGE|326|25003|Berkshire County
WEST TISBURY|327|25007|Dukes County
WESTBOROUGH|328|25027|Worcester County
WESTFIELD|329|25013|Hampden County
WESTFORD|330|25017|Middlesex County
WESTHAMPTON|331|25015|Hampshire County
WESTMINSTER|332|25027|Worcester County
WESTON|333|25017|Middlesex County
WESTPORT|334|25005|Bristol County
WESTWOOD|335|25021|Norfolk County
WEYMOUTH|336|25021|Norfolk County
WHATELY|337|25011|Franklin County
WHITMAN|338|25023|Plymouth County
WILBRAHAM|339|25013|Hampden County
WILLIAMSBURG|340|25015|Hampshire County
WILLIAMSTOWN|341|25003|Berkshire County
WILMINGTON|342|25017|Middlesex County
WINCHENDON|343|25027|Worcester County
WINCHESTER|344|25017|Middlesex County
WINDSOR|345|25003|Berkshire County
WINTHROP|346|25025|Suffolk County
WOBURN|347|25017|Middlesex County
WORCESTER|348|25027|Worcester County
WORTHINGTON|349|25015|Hampshire County
WRENTHAM|350|25021|Norfolk County
YARMOUTH|351|25001|Barnstable County`;
export const MA_TOWN_COUNTY_CROSSWALK = Object.freeze(Object.fromEntries(MA_TOWN_COUNTY_ROWS.split('\n').map((line) => {
  const [name, townId, countyFips, countyName] = line.split('|');
  return [name, Object.freeze({ name, massgis_town_id: Number(townId), county_fips: countyFips, county_name: countyName })];
})));

export const NATIONAL_URLS = Object.freeze(Object.fromEntries(['SG', 'GG', 'HG'].map((code) => [code, `https://politics.api.cnn.io/results/national-races/2026-${code}.json`])));
const OFFICE = { SG: 'senate', SP: 'senate', GG: 'governor', HG: 'house' };
const OFFICES = ['senate', 'house', 'governor'];
const MAX_BYTES = 8 * 1024 * 1024;
const MIN_REFRESH_MS = 30_000;
const CACHE_SECONDS = 7 * 24 * 60 * 60;
const MAX_MEMORY_ITEMS = 65;
const POLL_CLOSE_MIN = Date.parse('2026-11-03T12:00:00Z');
const POLL_CLOSE_MAX = Date.parse('2026-11-04T12:00:00Z');
const clone = (value) => JSON.parse(JSON.stringify(value));
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const party = (value) => ({ D: 'DEM', DEM: 'DEM', DEMOCRAT: 'DEM', DEMOCRATIC: 'DEM', R: 'REP', REP: 'REP', GOP: 'REP', REPUBLICAN: 'REP' })[String(value || '').toUpperCase()] || String(value || 'UNKNOWN').toUpperCase();
const awareTime = (value) => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
const VOTE_PROGRESS_SEMANTICS_URL = 'https://www.cnn.com/election/2026/results/north-carolina/us-senate';
const realCounty = (id, state) => state !== 'AK' && typeof id === 'string' && /^\d{5}$/.test(id) && id.startsWith(STATES[state].fips);
// CNN also publishes municipal detail in this field (e.g. 92623098 Detroit,
// 94440001 Barrington). These are source identifiers, never Census FIPS.
const sourceLocality = (id, state) => typeof id === 'string' && /^9\d{7}$/.test(id) && id.slice(1, 3) === STATES[state].fips;
const alaskaReportingUnit = (id, state) => state === 'AK' && typeof id === 'string' && /^9902(?:00[1-9]|0[1-3][0-9]|040|099)$/.test(id);
const errorText = (error) => String(error?.message || error || 'Source unavailable').slice(0, 400);
class InputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

export function raceParts(raceId) {
  const match = typeof raceId === 'string' && /^2026-(SG|SP|GG|HG)-([A-Z]{2})(?:-([1-9][0-9]?))?$/.exec(raceId);
  if (!match || !STATES[match[2]] || (match[1] === 'HG') !== Boolean(match[3]) || Number(match[3] || 0) > 53 || (match[1] === 'SP' && !['FL', 'OH'].includes(match[2]))) throw new InputError('Unsupported current-election race ID.');
  return { code: match[1], state: match[2], district: match[3] ? String(Number(match[3])) : null };
}

export function validateRows(rows, office, countyRaceId = null) {
  if (!NATIONAL_URLS[office] || !Array.isArray(rows) || !rows.length || rows.length > 2000) throw new Error('Invalid bounded results inventory.');
  if (countyRaceId) raceParts(countyRaceId);
  const output = [], seen = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid result row.');
    if (!countyRaceId && office === 'HG' && row.ecKey === '2026-HQ-TX-18') continue;
    const parts = raceParts(row.ecKey);
    if (!(office === 'SG' ? ['SG', 'SP'] : [office]).includes(parts.code) || row.stateAbbreviation !== parts.state || row.contestType !== parts.code || row.electionType !== (parts.code === 'SP' ? 'P' : 'G') || row.raceType !== parts.code[0] || row.raceTypeCode !== parts.code[0] || row.stateFipsCode !== STATES[parts.state].fips || row.resourceType !== (countyRaceId ? 'county-races' : 'race')) throw new Error('Source race identity or office metadata disagrees.');
    if (parts.code === 'HG' && row.jurisdictionCode !== Number(parts.district)) throw new Error('Source House district identity disagrees.');
    if (!countyRaceId && parts.code !== 'HG' && row.jurisdictionCode !== 0) throw new Error('Source statewide jurisdiction disagrees.');
    if (!countyRaceId && !(Number.isFinite(row.raceEmbargo?.assignedPollsClose) && row.raceEmbargo.assignedPollsClose >= POLL_CLOSE_MIN && row.raceEmbargo.assignedPollsClose < POLL_CLOSE_MAX)) throw new Error('Source is outside the November election window.');
    if (countyRaceId && (row.ecKey !== countyRaceId || !(realCounty(row.countyFipsCode, parts.state) || sourceLocality(row.countyFipsCode, parts.state) || alaskaReportingUnit(row.countyFipsCode, parts.state)) || typeof (row.countyLongName || row.countyName) !== 'string' || !(row.countyLongName || row.countyName).trim())) throw new Error('County/source-locality geography does not match the selected race.');
    const identity = countyRaceId ? row.countyFipsCode : row.ecKey;
    if (seen.has(identity)) throw new Error('Duplicate race/geography in cumulative source.');
    seen.add(identity);
    if (!(row.totalVote == null || count(row.totalVote)) || !Array.isArray(row.candidates) || !row.candidates.length || row.candidates.length > 100 || row.candidates.some((c) => !c || !(c.voteNum == null || count(c.voteNum)))) throw new Error('Invalid all-candidate vote counts.');
    const ids = row.candidates.map((c, index) => String(c.candidateId ?? index));
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate candidate identity.');
    const sum = row.candidates.reduce((total, c) => total + (c.voteNum ?? 0), 0);
    if (!count(sum) || count(row.totalVote) && sum > row.totalVote) throw new Error('Candidate counts exceed the published source total.');
    output.push(row);
  }
  if (!output.length) throw new Error('No verified current election rows.');
  return output;
}

function candidates(raw, total, released) {
  const rows = raw.map((c, index) => ({ candidate_id: String(c.candidateId ?? index), name: c.fullName || c.candidate || 'Unnamed candidate', party: party(c.majorParty), party_label: c.partyName || c.party || null, votes: released && count(c.voteNum) ? c.voteNum : null, vote_share: released && count(c.voteNum) && count(total) && total > 0 ? c.voteNum / total : null }));
  const complete = released && count(total) && rows.every((c) => c.votes !== null);
  const knownTotal = released ? rows.reduce((sum, c) => sum + (c.votes ?? 0), 0) : null;
  const residual = complete ? total - knownTotal : null;
  return { candidates: rows, reported_total: released && count(total) ? total : null, status: !released ? 'votes_not_released' : (total || knownTotal || 0) > 0 ? 'reporting' : complete ? 'awaiting_returns' : 'counts_unavailable', vote_counts_complete: complete, known_candidate_vote_total: knownTotal, candidate_attributed_total: complete ? knownTotal : null, unattributed_source_votes: residual, accounting_status: !released ? 'counts_unavailable' : !complete ? 'partial_candidate_counts' : residual > 0 ? 'unattributed_source_votes' : 'exact' };
}

function voteProgress(row, source, released) {
  const percent = released && Number.isFinite(row.percentReporting) && row.percentReporting >= 0 && row.percentReporting <= 100 ? row.percentReporting : null;
  return { kind: 'source_estimated_vote_percentage', label: 'CNN estimated vote in', percent_votes_counted: percent, percent_votes_remaining: percent === null ? null : 100 - percent, expected_votes: null, estimated_votes_remaining: null, source_field: 'percentReporting', source_name: 'CNN', source_url: source?.source_url || null, semantics_source_url: VOTE_PROGRESS_SEMANTICS_URL, remaining_percentage_derived: true, definition: 'CNN estimated percentage of votes in; remaining percentage is its complement, not a remaining-vote count. Rounded source percentages do not establish final totals.', unavailable_reason: percent !== null ? null : released ? 'Source estimate unavailable.' : 'Votes not released by source.' };
}

function normalizedRace(row, source) {
  const parts = raceParts(row.ecKey), embargo = row.raceEmbargo || {}, released = embargo.votesReleased === true;
  const winners = row.candidates.filter((c) => c.winner === true);
  const called = row.editorialStatus === 'called' && embargo.callsReleased === true && winners.length === 1 ? { candidate_id: String(winners[0].candidateId), name: winners[0].fullName, party: party(winners[0].majorParty), source: 'CNN', source_url: source.source_url } : null;
  const progress = voteProgress(row, source, released);
  return { race_id: row.ecKey, state: parts.state, office: OFFICE[parts.code], district: parts.district, seat: null, stage: 'general', special: parts.code === 'SP', cycle: 2026, label: `${parts.state} ${OFFICE[parts.code][0].toUpperCase()}${OFFICE[parts.code].slice(1)}${parts.district ? ' ' + parts.district : ''}${parts.code === 'SP' ? ' Special' : ''}`, ...candidates(row.candidates, row.totalVote, released), source_name: 'CNN', source_url: source.source_url, checked_at: source.retrieved_at, source_updated_at: awareTime(row.voteTimestamp), source_extracted_at_raw: row.extractedAt ?? null, poll_close_at: new Date(embargo.assignedPollsClose).toISOString(), poll_status: embargo.pollsClosed === true ? 'closed' : embargo.pollsClosed === false ? 'open' : 'unknown', polls_closed: typeof embargo.pollsClosed === 'boolean' ? embargo.pollsClosed : null, votes_released: released, source_percent_reporting: progress.percent_votes_counted, source_vote_progress: progress, percent_reporting_definition: progress.definition, source_called_winner: called, historical_comparison: null, preforecast_comparison: null, our_model_race_call: null, win_probability: null };
}

const maTownName = (value) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toUpperCase() : '';
function sourceUpdateRange(rows) {
  const times = rows.map((row) => row.source_updated_at).filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b));
  return { oldest: times[0] || null, newest: times.at(-1) || null, unknown_count: rows.filter((row) => !row.source_updated_at).length };
}

/** Verified town partition; each retained vote enters exactly one county. */
function massachusettsCounties(rows, parent, source) {
  const failure = (reason) => ({ rows: null, reason });
  if (!rows.length || rows.some((row) => row.unit_kind !== 'source_locality')) return failure('Massachusetts municipal rows are required for county aggregation.');
  const isHouse = parent.office === 'house', seen = new Set(), groups = new Map(), roster = new Map(parent.candidates.map((candidate) => [candidate.candidate_id, candidate]));
  for (const row of rows) {
    const name = maTownName(row.name), place = MA_TOWN_COUNTY_CROSSWALK[name];
    if (!place) return failure('A Massachusetts source municipality has no verified county match.');
    if (seen.has(name)) return failure('A Massachusetts source municipality occurs more than once.');
    seen.add(name);
    if (!groups.has(place.county_fips)) groups.set(place.county_fips, { place, members: [] });
    groups.get(place.county_fips).members.push(row);
    for (const candidate of row.candidates) {
      const old = roster.get(candidate.candidate_id);
      if (old && (old.name !== candidate.name || old.party !== candidate.party)) return failure('Massachusetts candidate identities disagree between municipalities.');
      if (!old) roster.set(candidate.candidate_id, candidate);
    }
  }
  if (!isHouse && (seen.size !== 351 || Object.keys(MA_TOWN_COUNTY_CROSSWALK).some((name) => !seen.has(name)))) return failure('The statewide Massachusetts source does not contain all 351 verified municipalities.');
  const output = [];
  for (const [countyFips, { place, members }] of groups) {
    const total = members.every((row) => count(row.reported_total)) ? members.reduce((sum, row) => sum + row.reported_total, 0) : null;
    const rawCandidates = [...roster.values()].map((candidate) => {
      const values = members.map((row) => row.candidates.find((value) => value.candidate_id === candidate.candidate_id));
      return { candidateId: candidate.candidate_id, fullName: candidate.name, majorParty: candidate.party,
        partyName: candidate.party_label, voteNum: values.every((value) => value && count(value.votes)) ? values.reduce((sum, value) => sum + value.votes, 0) : null };
    });
    const progress = { ...voteProgress({}, source, parent.votes_released === true), source_field: null, remaining_percentage_derived: false,
      definition: 'No county vote-progress estimate is supplied; municipal percentages are not combined.',
      unavailable_reason: 'CNN publishes municipal vote-progress estimates, not a county estimate; no percentage is derived.' };
    const range = sourceUpdateRange(members), expected = Object.values(MA_TOWN_COUNTY_CROSSWALK).filter((town) => town.county_fips === countyFips).length;
    output.push({ reporting_unit_id: countyFips, county_fips: countyFips,
      geography_type: isHouse ? 'county_fragment' : 'county', unit_kind: isHouse ? 'county_fragment' : 'county',
      geography_scope: isHouse ? 'house_district_county_portion' : 'whole_county', geographic_join_supported: true,
      included_in_coverage_total: true, name: place.county_name,
      race_id: parent.race_id, state: 'MA', district: parent.district,
      ...candidates(rawCandidates, total, parent.votes_released === true),
      source_percent_reporting: null, source_vote_progress: progress, percent_reporting_definition: progress.definition,
      source_updated_at: range.unknown_count ? null : range.oldest, source_update_range: range,
      source_url: source.source_url, checked_at: source.retrieved_at, source_name: 'CNN',
      source_status: members.some((row) => row.source_stale) ? 'stale' : 'cached', source_stale: members.some((row) => row.source_stale),
      result_kind: 'aggregated_municipal_results', aggregation_basis: 'verified_ma_town_to_county_rollup',
      municipality_count: members.length, county_municipality_count: expected, whole_county_coverage_verified: !isHouse && members.length === expected,
      source_reporting_unit_ids: members.map((row) => row.reporting_unit_id).sort(),
      geography_source: MA_TOWN_CROSSWALK_SOURCE, historical_comparison: null, source_called_winner: null, our_model_race_call: null, win_probability: null });
  }
  return { rows: output.sort((a, b) => a.county_fips.localeCompare(b.county_fips)), reason: null };
}

function countyView(snapshot, parent) {
  const source = snapshot?.source, stale = Boolean(snapshot?.error || snapshot?.stale);
  const rows = (snapshot?.rows || []).map((row) => { const canonical = realCounty(row.countyFipsCode, parent.state), progress = voteProgress(row, source, parent.votes_released === true), geographyType = canonical ? 'county' : parent.state === 'AK' ? row.countyFipsCode === '9902099' ? 'source_reporting_category' : 'source_election_district' : 'source_locality';return { reporting_unit_id: row.countyFipsCode, county_fips: canonical ? row.countyFipsCode : null, geography_type: geographyType, unit_kind: geographyType, geographic_join_supported: canonical, included_in_coverage_total: canonical, name: row.countyLongName || row.countyName || row.countyFipsCode, race_id: parent.race_id, state: parent.state, district: parent.district, ...candidates(row.candidates, row.totalVote, parent.votes_released === true), source_percent_reporting: progress.percent_votes_counted, percent_reporting_definition: progress.definition, source_vote_progress: progress, source_updated_at: awareTime(row.voteTimestamp), source_url: source.source_url, checked_at: source.retrieved_at, source_name: 'CNN', source_status: stale ? 'stale' : 'cached', source_stale: stale, historical_comparison: null, our_model_race_call: null, win_probability: null }; }).sort((a, b) => a.reporting_unit_id.localeCompare(b.reporting_unit_id));
  // Municipal detail can duplicate its parent county (Michigan Wayne does).
  // Never sum all source rows or assume a town-only feed is an exhaustive partition.
  const rawCanonicalRows = rows.filter((r) => r.included_in_coverage_total);
  const rolled = parent.state === 'MA' && !rawCanonicalRows.length && rows.length ? massachusettsCounties(rows, parent, source) : null;
  const canonicalRows = rolled?.rows || rawCanonicalRows, outputRows = canonicalRows.length ? canonicalRows : rows;
  const supplemental = canonicalRows.length ? rows.filter((r) => !r.included_in_coverage_total) : [];
  const total = canonicalRows.length && canonicalRows.every((r) => r.reported_total !== null) ? canonicalRows.reduce((sum, r) => sum + r.reported_total, 0) : null;
  return { rows: outputRows, supplemental_localities: supplemental, coverage: { status: rows.length ? stale ? 'stale' : 'available' : 'unavailable', source_status: rows.length ? stale ? 'stale' : 'cached' : 'unavailable', error: snapshot?.error || null, stale, checked_at: source?.retrieved_at || null, snapshot_id: source?.sha256 || null, refresh_checked_at: snapshot?.last_attempt_at || null, last_refresh_attempt_at: snapshot?.last_attempt_at || null, source_url: source?.source_url || null, reported_total: total, aggregation_basis: rolled?.rows ? 'verified_ma_town_to_county_rollup' : canonicalRows.length ? 'canonical_county_rows_only' : rows.length ? 'unverified_source_locality_partition' : null, aggregation_error: rolled?.reason || null, source_unit_count: rows.length, source_canonical_county_count: rawCanonicalRows.length, derived_county_count: rolled?.rows?.length || 0, canonical_county_count: canonicalRows.length, source_locality_count: rows.length - rawCanonicalRows.length, aggregation_excludes_source_localities: supplemental.length > 0, matches_national_snapshot: total !== null && parent.reported_total !== null ? total === parent.reported_total : null, source_update_range: sourceUpdateRange(rows), note: rolled?.rows ? 'Massachusetts source municipalities are joined to authoritative MassGIS county assignments and summed exactly once. Original municipal rows remain separate; House aggregates cover district portions only. No county vote-progress percentage is inferred.' : 'County and national feeds are independently timed snapshots. Only canonical county rows enter coverage totals; source-locality detail may overlap counties and is never added. Town-only partition completeness is unverified.' } };
}

export function buildView(snapshot, query = {}, county = null, now = Date.now()) {
  const all = Object.values(snapshot.offices || {}).flatMap((source) => source.rows.map((row) => normalizedRace(row, source)));
  const selected = all.filter((r) => ['office', 'state', 'race_id'].every((key) => !query[key] || r[key] === query[key]));
  const parent = query.race_id ? all.find((r) => r.race_id === query.race_id) : null;
  const counties = query.detail === 'county' && parent ? countyView(county, parent) : { rows: [], coverage: { status: 'not_requested' } };
  const sources = Object.values(snapshot.offices || {}).map(({ rows, ...metadata }) => metadata);
  const error = snapshot.error || null;
  return { schema_version: 'results_map_v1', as_of: new Date(now).toISOString(), source: { status: snapshot.verified ? error ? 'stale' : 'cached' : 'unavailable', checked_at: snapshot.checked_at || null, last_successful_check_at: snapshot.checked_at || null, snapshot_id: sources.map((s) => s.sha256).join('-') || null, refresh_checked_at: snapshot.last_attempt_at || null, last_refresh_attempt_at: snapshot.last_attempt_at || null, providers: [...new Set(selected.map((r) => r.source_name))], snapshots: sources, error, stale: Boolean(error || snapshot.stale) }, offices: OFFICES, states: Object.values(STATES).map((state) => { const races = selected.filter((r) => r.state === state.state).sort((a, b) => a.office.localeCompare(b.office) || Number(a.district || 0) - Number(b.district || 0) || a.race_id.localeCompare(b.race_id)); return { ...state, status: races.some((r) => (r.reported_total || 0) > 0) ? 'reporting' : races.length ? 'awaiting_returns' : 'no_data', races }; }), counties: counties.rows, supplemental_localities: counties.supplemental_localities || [], county_coverage: counties.coverage, coverage: { states_with_races: [...new Set(selected.map((r) => r.state))].sort(), loaded_contests: selected.length, reporting_contests: selected.filter((r) => (r.reported_total || 0) > 0).length, source_contests_before_filter: all.length, suppressed_overlapping_state_contests: [], source_offices: Object.fromEntries(OFFICES.map((office) => [office, all.filter((r) => r.office === office).length])) }, warnings: [error ? 'Public source refresh delayed; the last verified results are retained.' : null, county?.error ? 'County refresh delayed; any saved county snapshot is retained.' : null].filter(Boolean), our_model_race_call: null, win_probability: null, note: 'Reported source counts and source-attributed calls only. Missing data is not zero. CNN vote-in percentages are estimates, not final totals or our forecasts.' };
}

export function parseQuery(url) {
  const query = Object.create(null);
  for (const [key, value] of url.searchParams) {
    if (!['office', 'state', 'race_id', 'detail'].includes(key) || key in query || !value) throw new InputError('Unknown, empty or repeated results query.');
    query[key] = value;
  }
  if (query.office && !OFFICES.includes(query.office)) throw new InputError('Unknown office.');
  if (query.state && !STATES[query.state]) throw new InputError('Unknown state.');
  if (query.detail && (query.detail !== 'county' || !query.race_id)) throw new InputError('County detail requires a race ID.');
  if (query.race_id) { const parts = raceParts(query.race_id); if (query.state && query.state !== parts.state || query.office && query.office !== OFFICE[parts.code]) throw new InputError('Race and selected office/state disagree.'); }
  return query;
}

async function boundedText(response, maxBytes) {
  if (Number(response.headers.get('content-length') || 0) > maxBytes) throw new Error('Response exceeds its byte bound.');
  if (!response.body) throw new Error('Empty response.');
  const reader = response.body.getReader();let size = 0;const chunks = [];
  try { for (;;) { const { value, done } = await reader.read();if (done) break;size += value.byteLength;if (size > maxBytes) throw new Error('Response exceeds its byte bound.');chunks.push(value); } }
  finally { reader.releaseLock(); }
  const body = new Uint8Array(size);let offset = 0;for (const chunk of chunks) { body.set(chunk, offset);offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(body);
}

const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });

export function createResultsWorker({ fetcher = globalThis.fetch, cache = globalThis.caches?.default, now = () => Date.now() } = {}) {
  const memory = new Map(), running = new Map();
  const storageKey = (key) => new Request(`https://election-results-cache.invalid/v1/${encodeURIComponent(key)}`);
  async function read(key) {
    if (memory.has(key)) { const value = memory.get(key);memory.delete(key);memory.set(key, value);return clone(value); }
    if (cache) try { const response = await cache.match(storageKey(key));if (response) { const value = JSON.parse(await boundedText(response, 32 * 1024 * 1024));if (value.version === 1 && value.key === key) return value; } } catch {}
    return null;
  }
  async function save(key, value) {
    const data = { ...value, version: 1, key };memory.delete(key);memory.set(key, clone(data));
    while (memory.size > MAX_MEMORY_ITEMS) memory.delete(memory.keys().next().value);
    if (cache) try { await cache.put(storageKey(key), new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } })); } catch {}
    return data;
  }
  async function source(url, office, countyRaceId = null) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetcher(url, { redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'ElectionResultsDashboard/1.0 (public aggregate results)' } });
      if (!response.ok || response.redirected) throw new Error(`Public results source returned HTTP ${response.status}.`);
      const text = await boundedText(response, MAX_BYTES), rows = validateRows(JSON.parse(text), office, countyRaceId);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return { source_url: url, office, county_race_id: countyRaceId, retrieved_at: new Date(now()).toISOString(), sha256: [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join(''), row_count: rows.length, rows, etag: response.headers.get('etag'), source_last_modified: response.headers.get('last-modified') };
    } finally { clearTimeout(timer); }
  }
  async function national() {
    const key = 'national', old = await read(key);
    if (old && now() - Date.parse(old.last_attempt_at) >= 0 && now() - Date.parse(old.last_attempt_at) < MIN_REFRESH_MS) return old;
    if (running.has(key)) return running.get(key);
    const operation = (async () => {
      const attempted = new Date(now()).toISOString(), offices = { ...(old?.offices || {}) }, errors = [];
      await Promise.all(Object.entries(NATIONAL_URLS).map(async ([office, url]) => {
        try { offices[office] = await source(url, office); }
        catch (error) { errors.push(`${office}: ${errorText(error)}`);if (offices[office]) offices[office] = { ...offices[office], stale: true, refresh_error: errorText(error), refresh_checked_at: attempted }; }
      }));
      const available = Object.values(offices);
      return save(key, { offices, verified: available.length > 0, checked_at: errors.length ? old?.checked_at || available.map((s) => s.retrieved_at).sort()[0] || null : attempted, last_attempt_at: attempted, error: errors.join('; ') || null, stale: errors.length > 0 });
    })();running.set(key, operation);
    try { return await operation; } finally { running.delete(key); }
  }
  async function counties(raceId, parentSnapshot) {
    const parts = raceParts(raceId), parent = Object.values(parentSnapshot.offices || {}).flatMap((s) => s.rows).find((r) => r.ecKey === raceId);
    if (!parent) throw new InputError('The selected race is absent from the verified source inventory.', 404);
    const key = `county-${raceId}`, old = await read(key);
    if (old && now() - Date.parse(old.last_attempt_at) >= 0 && now() - Date.parse(old.last_attempt_at) < MIN_REFRESH_MS) return old;
    if (running.has(key)) return running.get(key);
    const operation = (async () => {
      const attempted = new Date(now()).toISOString();
      try { const captured = await source(`https://politics.api.cnn.io/results/county-races/${raceId}.json`, parts.code === 'SP' ? 'SG' : parts.code, raceId);return save(key, { source: captured, rows: captured.rows, last_attempt_at: attempted, error: null, stale: false }); }
      catch (error) { return save(key, { ...(old || { rows: [], source: null }), last_attempt_at: attempted, error: errorText(error), stale: Boolean(old?.rows?.length) }); }
    })();running.set(key, operation);
    try { return await operation; } finally { running.delete(key); }
  }
  return { async fetch(request, env = {}, context = {}) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/results-map') {
        if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed.' }, 405);
        const query = parseQuery(url), snapshot = await national();let county = null;
        if (query.race_id && !Object.values(snapshot.offices || {}).some((s) => s.rows.some((r) => r.ecKey === query.race_id))) throw new InputError('Race not found in the verified source inventory.', 404);
        if (query.detail === 'county') county = await counties(query.race_id, snapshot);
        return jsonResponse(buildView(snapshot, query, county, now()));
      }
      if (url.pathname === '/api/results-map/refresh') {
        if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
        if (url.search || !/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) throw new InputError('Refresh requires a JSON body without query parameters.');
        let body;try { body = JSON.parse(await boundedText(request, 1024)); } catch { throw new InputError('Invalid or oversized refresh JSON.'); }
        if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some((k) => k !== 'county_race_id')) throw new InputError('Unknown refresh field.');
        if ('county_race_id' in body) raceParts(body.county_race_id);
        const snapshot = await national();const county = body.county_race_id ? await counties(body.county_race_id, snapshot) : null;
        return jsonResponse(buildView(snapshot, body.county_race_id ? { race_id: body.county_race_id, detail: 'county' } : {}, county, now()));
      }
      if (url.pathname.startsWith('/api/')) return jsonResponse({ error: 'Not found.' }, 404);
      if (!['GET', 'HEAD'].includes(request.method)) return jsonResponse({ error: 'Method not allowed.' }, 405);
      return env.ASSETS?.fetch ? env.ASSETS.fetch(request) : new Response('Static assets are not configured.', { status: 404 });
    } catch (error) { return jsonResponse({ error: error instanceof InputError ? error.message : 'Results are temporarily unavailable.' }, error instanceof InputError ? error.status : 503); }
  } };
}

const worker = createResultsWorker();
export default { fetch: (request, env, context) => worker.fetch(request, env, context) };
