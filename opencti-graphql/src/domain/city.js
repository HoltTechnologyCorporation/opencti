import { map } from 'ramda';
import uuid from 'uuid/v4';
import {
  deleteEntityById,
  getById,
  prepareDate,
  dayFormat,
  monthFormat,
  yearFormat,
  notify,
  now,
  paginate,
  takeWriteTx,
  prepareString
} from '../database/grakn';
import { BUS_TOPICS } from '../config/conf';

export const findAll = args => paginate('match $m isa City', args);

export const findById = cityId => getById(cityId);

export const addCity = async (user, city) => {
  const wTx = await takeWriteTx();
  const cityIterator = await wTx.query(`insert $city isa City 
    has type "city";
    $city has stix_id "${
      city.stix_id ? prepareString(city.stix_id) : `city--${uuid()}`
    }";
    $city has stix_label "";
    $city has alias "";
    $city has name "${prepareString(city.name)}";
    $city has description "${prepareString(city.description)}";
    $city has created ${city.created ? prepareDate(city.created) : now()};
    $city has modified ${city.modified ? prepareDate(city.modified) : now()};
    $city has revoked false;
    $city has created_at ${now()};
    $city has created_at_day "${dayFormat(now())}";
    $city has created_at_month "${monthFormat(now())}";
    $city has created_at_year "${yearFormat(now())}";
    $city has updated_at ${now()};
  `);
  const createCity = await cityIterator.next();
  const createdCityId = await createCity.map().get('city').id;

  if (city.createdByRef) {
    await wTx.query(`match $from id ${createdCityId};
         $to id ${city.createdByRef};
         insert (so: $from, creator: $to)
         isa created_by_ref;`);
  }

  if (city.markingDefinitions) {
    const createMarkingDefinition = markingDefinition =>
      wTx.query(
        `match $from id ${createdCityId}; $to id ${markingDefinition}; insert (so: $from, marking: $to) isa object_marking_refs;`
      );
    const markingDefinitionsPromises = map(
      createMarkingDefinition,
      city.markingDefinitions
    );
    await Promise.all(markingDefinitionsPromises);
  }

  await wTx.commit();

  return getById(createdCityId).then(created =>
    notify(BUS_TOPICS.StixDomainEntity.ADDED_TOPIC, created, user)
  );
};

export const cityDelete = cityId => deleteEntityById(cityId);
