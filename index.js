const core = require('@actions/core');
const github = require('@actions/github');
const asana = require('asana');

async function asanaOperations(
  asanaPAT,
  targets,
  taskId,
  taskComment,
  pullRequestUrl
) {
  try {
    const client = asana.Client.create({
      defaultHeaders: { 'asana-enable': 'new-sections,string_ids' },
      logAsanaChangeWarnings: false
    }).useAccessToken(asanaPAT);

    const task = await client.tasks.findById(taskId);
    
    targets.forEach(async target => {
      let targetProject = task.projects.find(project => project.name === target.project);
      if (targetProject) {
        let targetSection = await client.sections.findByProject(targetProject.gid)
          .then(sections => sections.find(section => section.name === target.section));
        if (targetSection) {
          await client.sections.addTask(targetSection.gid, { task: taskId });
          core.info(`Moved to: ${target.project}/${target.section}`);
        } else {
          core.error(`Asana section ${target.section} not found.`);
        }
      } else {
        core.info(`This task does not exist in "${target.project}" project`);
      }
    });

    await client.tasks.update(taskId, {
      custom_fields: {
        "1197740218331194": pullRequestUrl,
      },
    })

    if (taskComment) {
      await client.tasks.addComment(taskId, {
        text: taskComment
      });
    }
  } catch (ex) {
    core.error(ex.message);
  }
}

try {
  const ASANA_PAT = core.getInput('asana-pat'),
    TARGETS = core.getInput('targets'),
    TRIGGER_PHRASE = core.getInput('trigger-phrase'),
    TASK_COMMENT = core.getInput('task-comment'),
    PULL_REQUEST = github.context.payload.pull_request,
    REGEX = new RegExp(
      `${TRIGGER_PHRASE}\\s*https:\\/\\/app.asana.com\\/(\\d+)\\/(?<project>\\d+)\\/(?<task>\\d+).*?`,
      'g'
    );
  let taskComment = null,
    targets = TARGETS? JSON.parse(TARGETS) : [],
    pullRequestUrl = PULL_REQUEST.html_url,
    parseAsanaURL = null;

  if (!ASANA_PAT){
    throw({message: 'ASANA PAT Not Found!'});
  }
  if (TASK_COMMENT) {
    taskComment = `${TASK_COMMENT} ${PULL_REQUEST.html_url}`;
  }
  while ((parseAsanaURL = REGEX.exec(PULL_REQUEST.body)) !== null) {
    let taskId = parseAsanaURL.groups.task;
    if (taskId) {
      asanaOperations(ASANA_PAT, targets, taskId, taskComment, pullRequestUrl);
    } else {
      core.info(`Invalid Asana task URL after the trigger phrase ${TRIGGER_PHRASE}`);
    }
  }
} catch (error) {
  core.error(error.message);
}
