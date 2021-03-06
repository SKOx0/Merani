import moment from 'moment';
import {
  Actions,
  Thread,
  Label,
  DateUtils,
  TaskFactory,
  AccountStore,
  CategoryStore,
  DatabaseStore,
  SyncbackCategoryTask,
  ChangeLabelsTask,
  ChangeFolderTask,
  TaskQueue,
  FolderSyncProgressStore,
} from 'nylas-exports';
import {SNOOZE_CATEGORY_NAME} from './snooze-constants'

const {DATE_FORMAT_SHORT} = DateUtils


const SnoozeUtils = {

  snoozedUntilMessage(snoozeDate, now = moment()) {
    let message = 'Snoozed'
    if (snoozeDate) {
      let dateFormat = DATE_FORMAT_SHORT
      const date = moment(snoozeDate)
      const hourDifference = moment.duration(date.diff(now)).asHours()

      if (hourDifference < 24) {
        dateFormat = dateFormat.replace('MMM D, ', '');
      }
      if (date.minutes() === 0) {
        dateFormat = dateFormat.replace(':mm', '');
      }

      message += ` until ${DateUtils.format(date, dateFormat)}`;
    }
    return message;
  },

  createSnoozeCategory(accountId, name = SNOOZE_CATEGORY_NAME) {
    const task = new SyncbackCategoryTask({
      path: name,
      accountId: accountId,
    })

    Actions.queueTask(task)
    return TaskQueue.waitForPerformRemote(task).then((finishedTask) => {
      return finishedTask.created;
    });
  },

  getSnoozeCategory(accountId, categoryName = SNOOZE_CATEGORY_NAME) {
    return FolderSyncProgressStore.whenCategoryListSynced(accountId)
    .then(() => {
      const allCategories = CategoryStore.categories(accountId)
      const category = allCategories.find(c => c.displayName === categoryName)
      if (category) {
        return Promise.resolve(category);
      }
      return SnoozeUtils.createSnoozeCategory(accountId, categoryName)
    })
  },

  getSnoozeCategoriesByAccount(accounts = AccountStore.accounts()) {
    const snoozeCategoriesByAccountId = {}
    accounts.forEach(({id}) => {
      if (snoozeCategoriesByAccountId[id] != null) return;
      snoozeCategoriesByAccountId[id] = SnoozeUtils.getSnoozeCategory(id)
    })
    return Promise.props(snoozeCategoriesByAccountId)
  },

  moveThreads(threads, {snooze, getSnoozeCategory, getInboxCategory, description} = {}) {
    const tasks = TaskFactory.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
      const snoozeCat = getSnoozeCategory(accountId);
      const inboxCat = getInboxCategory(accountId);
      if (snoozeCat instanceof Label) {
        return new ChangeLabelsTask({
          source: "Snooze Move",
          threads: accountThreads,
          taskDescription: description,
          labelsToAdd: snooze ? [snoozeCat] : [inboxCat],
          labelsToRemove: snooze ? [inboxCat] : [snoozeCat],
        });
      }
      return new ChangeFolderTask({
        source: "Snooze Move",
        threads: accountThreads,
        taskDescription: description,
        folder: snooze ? snoozeCat : inboxCat,
      });
    });

    Actions.queueTasks(tasks);
    const promises = tasks.map(task => TaskQueue.waitForPerformRemote(task))
    // Resolve with the updated threads
    return (
      Promise.all(promises).then(() => {
        return DatabaseStore.modelify(Thread, threads.map(t => t.id))
      })
    )
  },

  moveThreadsToSnooze(threads, snoozeCategoriesByAccountPromise, snoozeDate) {
    return snoozeCategoriesByAccountPromise
    .then((snoozeCategoriesByAccountId) => {
      const getSnoozeCategory = (accId) => snoozeCategoriesByAccountId[accId]
      const getInboxCategory = (accId) => CategoryStore.getInboxCategory(accId)
      const description = SnoozeUtils.snoozedUntilMessage(snoozeDate)
      return SnoozeUtils.moveThreads(
        threads,
        {snooze: true, getSnoozeCategory, getInboxCategory, description}
      )
    })
  },

  moveThreadsFromSnooze(threads, snoozeCategoriesByAccountPromise) {
    return snoozeCategoriesByAccountPromise
    .then((snoozeCategoriesByAccountId) => {
      const getSnoozeCategory = (accId) => snoozeCategoriesByAccountId[accId]
      const getInboxCategory = (accId) => CategoryStore.getInboxCategory(accId)
      const description = 'Unsnoozed';
      return SnoozeUtils.moveThreads(
        threads,
        {snooze: false, getSnoozeCategory, getInboxCategory, description}
      )
    })
  },
}

export default SnoozeUtils
