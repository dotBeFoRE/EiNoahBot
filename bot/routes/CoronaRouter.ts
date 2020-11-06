import fetch from 'node-fetch';
import moment from 'moment';
import { CronJob } from 'cron';
import parse from 'csv-parse/lib/sync';
import { EntityManager } from '@mikro-orm/core';
import { Client } from 'discord.js';
import UserCoronaRegions from '../../data/entity/UserCoronaRegions';
import Router, { Handler } from '../Router';
import CoronaData, { CoronaInfo } from '../../data/entity/CoronaData';

const router = new Router();

const helpHandler : Handler = ({ msg }) => {
  let message = '**Krijg iedere morgen een rapportage over de locale corona situatie**';
  message += '\nMogelijke Commandos:';
  message += '\n`ei corona regions`: Vraag alle mogelijke regio\'s op';
  message += '\n`ei corona add <regio>`: Voeg een regio toe aan je dagelijkse rapportage';
  message += '\n`ei corona remove <regio>`: Verwijder een regio van je dagelijkse rapportage';

  msg.channel.send(message);
};

router.use(null, helpHandler);
router.use('help', helpHandler);

const addHandler : Handler = async ({
  msg, user, params, em,
}) => {
  if (!params.every((param) : param is string => typeof param === 'string')) {
    msg.channel.send('Jij denkt dat een persoon een regio is?');
    return;
  }

  const region = params.filter((param) : param is string => typeof param === 'string').join(' ');
  await user.coronaRegions.init();
  const currentRegions = user.coronaRegions.getItems()
    .find((r) => r.region.toLowerCase() === region.toLowerCase());

  if (currentRegions) {
    msg.channel.send('Deze regio is al toegevoegd');
    return;
  }

  const coronaReport = (await em.getRepository(CoronaData)
    .findAll({ limit: 500 }))
    .find((cr) => cr.community.toLowerCase() === region.toLowerCase());
  if (!coronaReport) {
    msg.channel.send(`${region} is niet een regio`);
    return;
  }

  const newRegion = new UserCoronaRegions();

  newRegion.region = coronaReport.community;
  newRegion.user = user;

  em.persist(newRegion);

  msg.channel.send(`${coronaReport.community} is toegevoegd aan je dagelijkse rapport`);
};

router.use('add', addHandler);
router.use('toevoegen', addHandler);

const removeHandler : Handler = async ({
  msg, user, params, em,
}) => {
  if (!params.every((param) : param is string => typeof param === 'string')) {
    msg.channel.send('Jij denkt dat een persoon een regio is?');
    return;
  }

  const region = params.filter((param) : param is string => typeof param === 'string').join(' ');
  await user.coronaRegions.init();
  const dbRegion = user.coronaRegions.getItems()
    .find((r) => r.region.toLowerCase() === region.toLowerCase());

  if (!dbRegion) {
    msg.channel.send('Je hebt deze regio nog niet toegevoegd');
    return;
  }

  em.remove(dbRegion);

  msg.channel.send(`${dbRegion.region} is verwijderd van je dagelijkse rapport`);
};

router.use('remove', removeHandler);
router.use('verwijder', removeHandler);
router.use('delete', removeHandler);

const listRegionsHandler : Handler = async ({ msg, em }) => {
  const coronaData = await em.getRepository(CoronaData).findAll({ limit: 500 });

  const regions = Array.from(new Set<string>(coronaData.map((data) => data.community)))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  if (regions.length === 0) msg.channel.send('Regio\'s zijn nog niet geladen (dit kan nog 10 minuten duren)');
  else msg.author.send(`Regio's:\n${regions.join('\n')}`, { split: true });
};

router.use('gemeentes', listRegionsHandler);
router.use('regions', listRegionsHandler);
router.use('steden', listRegionsHandler);
router.use('communities', listRegionsHandler);

const getPopulation = async () => {
  const population : {[key: string]: number | undefined} = {};

  const loadPopulation = async () => {
    const rawData = (await fetch('https://opendata.cbs.nl/CsvDownload/csv/03759ned/TypedDataSet?dl=41EB0').then((res) => res.text()))
      .replace(/"/g, '');

    const records = <Array<[string, string, string, string, string, string]>>parse(rawData, { delimiter: ';' });
    records.forEach((row) => {
      const amount = Number.parseInt(row[5], 10);
      if (Number.isInteger(amount) && row[0] === 'Totaal mannen en vrouwen') population[row[4].toLowerCase()] = amount;
    });
  };

  if (Object.keys(population).length === 0) { await loadPopulation(); }

  return population;
};

enum Niveau {
  Waakzaam = 'Waakzaam',
  zorgelijk = 'Zorgelijk',
  ernstig = 'Ernstig',
  zeerernstig = 'Zeer Ernstig'
}

const postReport = async (em : EntityManager, client : Client, userId ?: string) => {
  let userRegions : UserCoronaRegions[];
  if (userId) userRegions = await em.find(UserCoronaRegions, { user: { id: userId } });
  else userRegions = await em.getRepository(UserCoronaRegions).findAll();
  const regionPopulations = await getPopulation();

  const relevantReports = await em
    .find(CoronaData, { community: { $in: userRegions.map((region) => region.region) } });

  if (relevantReports.length === 0) return;

  const groupedReports : {[key : string]: CoronaData[]} = {};
  relevantReports.forEach((report) => {
    if (groupedReports[report.community.toLowerCase()]) {
      groupedReports[report.community.toLowerCase()].push(report);
    } else groupedReports[report.community.toLowerCase()] = [report];
  });

  interface WeeklyCoronaDataCounted {
    deceased: number
    totalReported: number
    hospitalized: number
  }

  const weeklyCountPerRegion : {[key : string]: WeeklyCoronaDataCounted} = {};

  Object.keys(groupedReports).forEach((key) => {
    groupedReports[key] = groupedReports[key]
      .sort((r1, r2) => r2.date.getTime() - r1.date.getTime());

    weeklyCountPerRegion[key] = { deceased: 0, hospitalized: 0, totalReported: 0 };

    for (let i = 0; i < 7; i += 1) {
      const currentReport = groupedReports[key][i];

      weeklyCountPerRegion[key].deceased += currentReport.deceased;
      weeklyCountPerRegion[key].hospitalized += currentReport.hospitalAdmissions;
      weeklyCountPerRegion[key].totalReported += currentReport.totalReported;
    }
  });

  const groupedUsers : {[key : string]: UserCoronaRegions[]} = {};
  userRegions.forEach((userRegion) => {
    if (groupedUsers[userRegion.user.id]) groupedUsers[userRegion.user.id].push(userRegion);
    else groupedUsers[userRegion.user.id] = [userRegion];
  });

  Object.keys(groupedUsers).forEach(async (key) => {
    const regions = groupedUsers[key];

    const reports = regions.map((r) => {
      const weeklyCount = weeklyCountPerRegion[r.region.toLowerCase()];
      const population = regionPopulations[r.region.toLowerCase()];

      const casesPer = population
        ? Math.round((weeklyCount.totalReported / population) * 100_000) : 0;
      const hospitalPer = population
        ? Math.round((weeklyCount.hospitalized / population) * 100_000) : 0;
      const deceasedPer = population
        ? Math.round((weeklyCount.deceased / population) * 100_000) : 0;

      let niveau : Niveau;

      if (casesPer < 50) niveau = Niveau.Waakzaam;
      else if (casesPer <= 150) niveau = Niveau.zorgelijk;
      else if (casesPer <= 250) niveau = Niveau.ernstig;
      else niveau = Niveau.zeerernstig;

      let message = `**${r.region} (${niveau})**`;
      message += `\nNieuwe gevallen: ${weeklyCount.totalReported}`;
      if (casesPer) message += ` (${casesPer} / 100,000 per week)`;
      message += `\nZiekenhuis Opnames: ${weeklyCount.hospitalized}`;
      if (hospitalPer) message += ` (${hospitalPer} / 100,000 per week)`;
      message += `\nDoden: ${weeklyCount.deceased}`;
      if (deceasedPer) message += ` (${deceasedPer} / 100,000 per week)`;

      return message;
    });

    const report = `*Corona cijfers deze week (**dikgedrukt** betekent boven signaalwaarde)*\n${reports.join('\n')}`;
    const user = await client.users.fetch(groupedUsers[key][0].user.id, true);
    user.send(report, { split: true });
  });
};

const raportHandle : Handler = ({ em, msg }) => {
  postReport(em, msg.client, msg.author.id);
};

router.use('raport', raportHandle);
router.use('rapport', raportHandle);
router.use('report', raportHandle);

router.onInit = async (client, orm) => {
  const refreshData = async () => {
    const em = orm.em.fork();

    const inDb = await em.getRepository(CoronaData).findAll();
    const fetchedData = <CoronaInfo[]>(await fetch('https://data.rivm.nl/covid-19/COVID-19_aantallen_gemeente_per_dag.json').then((res) => res.json()));

    const coronaData = fetchedData
      .map((info) => new CoronaData(info))
      .filter((data) => data.community !== null)
      .filter((data) => !inDb
        .some((db) => db.community === data.community
          && db.date.getTime() === data.date.getTime()));

    const duplicatesRemoved : CoronaData[] = [];
    coronaData.forEach((data) => {
      const duplicate = duplicatesRemoved
        .find((item) => item.community === data.community
        && item.date.getTime() === data.date.getTime());

      if (!duplicate) duplicatesRemoved.push(data);
    });

    if (duplicatesRemoved.length > 0) {
      console.log(`${moment().format('HH:mm')}: ${duplicatesRemoved.length} new corona_data rows`);
    } else {
      console.log(`${moment().format('HH:mm')}: no new data`);
    }
    em.persist(duplicatesRemoved);

    await em.flush();

    setTimeout(refreshData, 1000 * 60 * 60 * 3);
  };

  if (process.env.REFRESH_DATA !== 'false') {
    refreshData();
  }

  const reportCron = new CronJob('0 9 * * *', () => postReport(orm.em.fork(), client));

  if (process.env.POST_RAPPORT === 'true') postReport(orm.em.fork(), client);

  reportCron.start();
};

export default router;