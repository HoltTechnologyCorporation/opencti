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

export const findAll = args => paginate('match $m isa Tool', args);

export const findById = toolId => getById(toolId);

export const addTool = async (user, tool) => {
  const wTx = await takeWriteTx();
  const toolIterator = await wTx.query(`insert $tool isa Tool 
    has type "tool";
    $tool has stix_id "${
      tool.stix_id ? prepareString(tool.stix_id) : `tool--${uuid()}`
    }";
    $tool has stix_label "";
    $tool has alias "";
    $tool has name "${prepareString(tool.name)}";
    $tool has description "${prepareString(tool.description)}";
    $tool has created ${tool.created ? prepareDate(tool.created) : now()};
    $tool has modified ${tool.modified ? prepareDate(tool.modified) : now()};
    $tool has revoked false;
    $tool has created_at ${now()};
    $tool has created_at_day "${dayFormat(now())}";
    $tool has created_at_month "${monthFormat(now())}";
    $tool has created_at_year "${yearFormat(now())}";      
    $tool has updated_at ${now()};
  `);
  const createTool = await toolIterator.next();
  const createdToolId = await createTool.map().get('tool').id;

  if (tool.createdByRef) {
    await wTx.query(`match $from id ${createdToolId};
         $to id ${tool.createdByRef};
         insert (so: $from, creator: $to)
         isa created_by_ref;`);
  }

  if (tool.markingDefinitions) {
    const createMarkingDefinition = markingDefinition =>
      wTx.query(
        `match $from id ${createdToolId}; $to id ${markingDefinition}; insert (so: $from, marking: $to) isa object_marking_refs;`
      );
    const markingDefinitionsPromises = map(
      createMarkingDefinition,
      tool.markingDefinitions
    );
    await Promise.all(markingDefinitionsPromises);
  }

  if (tool.killChainPhases) {
    const createKillChainPhase = killChainPhase =>
      wTx.query(
        `match $from id ${createdToolId}; $to id ${killChainPhase}; insert (phase_belonging: $from, kill_chain_phase: $to) isa kill_chain_phases;`
      );
    const killChainPhasesPromises = map(
      createKillChainPhase,
      tool.killChainPhases
    );
    await Promise.all(killChainPhasesPromises);
  }

  await wTx.commit();

  return getById(createdToolId).then(created =>
    notify(BUS_TOPICS.StixDomainEntity.ADDED_TOPIC, created, user)
  );
};

export const toolDelete = toolId => deleteEntityById(toolId);
