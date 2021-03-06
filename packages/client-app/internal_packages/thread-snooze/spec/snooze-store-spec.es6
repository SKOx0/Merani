import {
  AccountStore,
  CategoryStore,
  NylasAPIHelpers,
  Thread,
  Actions,
  Folder,
} from 'nylas-exports'
import SnoozeUtils from '../lib/snooze-utils'
import SnoozeStore from '../lib/snooze-store'


xdescribe('SnoozeStore', function snoozeStore() {
  beforeEach(() => {
    this.store = new SnoozeStore('plug-id', 'plug-name')
    this.name = 'Snooze folder'
    this.accounts = [{id: 123}, {id: 321}]

    this.snoozeCatsByAccount = {
      123: new Folder({accountId: 123, displayName: this.name, id: 'sn-1'}),
      321: new Folder({accountId: 321, displayName: this.name, id: 'sn-2'}),
    }
    this.inboxCatsByAccount = {
      123: new Folder({accountId: 123, name: 'inbox', id: 'in-1'}),
      321: new Folder({accountId: 321, name: 'inbox', id: 'in-2'}),
    }
    this.threads = [
      new Thread({accountId: 123, id: 's-1'}),
      new Thread({accountId: 123, id: 's-2'}),
      new Thread({accountId: 321, id: 's-3'}),
    ]
    this.updatedThreadsByAccountId = {
      123: {
        threads: [this.threads[0], this.threads[1]],
        snoozeCategoryId: 'sn-1',
        returnCategoryId: 'in-1',
      },
      321: {
        threads: [this.threads[2]],
        snoozeCategoryId: 'sn-2',
        returnCategoryId: 'in-2',
      },
    }
    this.store.snoozeCategoriesPromise = Promise.resolve()
    spyOn(this.store, 'recordSnoozeEvent')
    spyOn(this.store, 'groupUpdatedThreads').andReturn(Promise.resolve(this.updatedThreadsByAccountId))

    spyOn(AccountStore, 'accountsForItems').andReturn(this.accounts)
    spyOn(NylasAPIHelpers, 'authPlugin').andReturn(Promise.resolve())
    spyOn(SnoozeUtils, 'moveThreadsToSnooze').andReturn(Promise.resolve(this.threads))
    spyOn(SnoozeUtils, 'moveThreadsFromSnooze')
    spyOn(Actions, 'closePopover')
    spyOn(NylasEnv, 'reportError')
    spyOn(NylasEnv, 'showErrorDialog')
  })

  describe('groupUpdatedThreads', () => {
    it('groups the threads correctly by account id, with their snooze and inbox categories', () => {
      spyOn(CategoryStore, 'getInboxCategory').andCallFake(accId => this.inboxCatsByAccount[accId])

      waitsForPromise(() => {
        return this.store.groupUpdatedThreads(this.threads, this.snoozeCatsByAccount)
        .then((result) => {
          expect(result['123']).toEqual({
            threads: [this.threads[0], this.threads[1]],
            snoozeCategoryId: 'sn-1',
            returnCategoryId: 'in-1',
          })
          expect(result['321']).toEqual({
            threads: [this.threads[2]],
            snoozeCategoryId: 'sn-2',
            returnCategoryId: 'in-2',
          })
        })
      })
    });
  });

  describe('onAccountsChanged', () => {
    it('updates categories promise if an account has been added', () => {
      const nextAccounts = [
        {id: 'ac1'},
        {id: 'ac2'},
        {id: 'ac3'},
      ]
      this.store.accountIds = ['ac1', 'ac2']
      spyOn(SnoozeUtils, 'getSnoozeCategoriesByAccount')
      spyOn(AccountStore, 'accounts').andReturn(nextAccounts)
      this.store.onAccountsChanged()
      expect(SnoozeUtils.getSnoozeCategoriesByAccount).toHaveBeenCalledWith(nextAccounts)
    });

    it('updates categories promise if an account has been removed', () => {
      const nextAccounts = [
        {id: 'ac1'},
        {id: 'ac3'},
      ]
      this.store.accountIds = ['ac1', 'ac2', 'ac3']
      spyOn(SnoozeUtils, 'getSnoozeCategoriesByAccount')
      spyOn(AccountStore, 'accounts').andReturn(nextAccounts)
      this.store.onAccountsChanged()
      expect(SnoozeUtils.getSnoozeCategoriesByAccount).toHaveBeenCalledWith(nextAccounts)
    });

    it('updates categories promise if an account is added and another removed', () => {
      const nextAccounts = [
        {id: 'ac1'},
        {id: 'ac3'},
      ]
      this.store.accountIds = ['ac1', 'ac2']
      spyOn(SnoozeUtils, 'getSnoozeCategoriesByAccount')
      spyOn(AccountStore, 'accounts').andReturn(nextAccounts)
      this.store.onAccountsChanged()
      expect(SnoozeUtils.getSnoozeCategoriesByAccount).toHaveBeenCalledWith(nextAccounts)
    });

    it('does not update categories promise if accounts have not changed', () => {
      const nextAccounts = [
        {id: 'ac1'},
        {id: 'ac2'},
      ]
      this.store.accountIds = ['ac1', 'ac2']
      spyOn(SnoozeUtils, 'getSnoozeCategoriesByAccount')
      spyOn(AccountStore, 'accounts').andReturn(nextAccounts)
      this.store.onAccountsChanged()
      expect(SnoozeUtils.getSnoozeCategoriesByAccount).not.toHaveBeenCalled()
    });
  });

  describe('onSnoozeThreads', () => {
    it('auths plugin against all present accounts', () => {
      waitsForPromise(() => {
        return this.store.onSnoozeThreads(this.threads, 'date', 'label')
        .then(() => {
          expect(NylasAPIHelpers.authPlugin).toHaveBeenCalled()
          expect(NylasAPIHelpers.authPlugin.calls[0].args[2]).toEqual(this.accounts[0])
          expect(NylasAPIHelpers.authPlugin.calls[1].args[2]).toEqual(this.accounts[1])
        })
      })
    });

    it('calls Actions.queueTask with the correct metadata', () => {
      waitsForPromise(() => {
        return this.store.onSnoozeThreads(this.threads, 'date', 'label')
        .then(() => {
          expect(Actions.queueTask).toHaveBeenCalled()
          const task1 = Actions.queueTask.calls[0].args[0];
          expect(task1.pluginId).toEqual('plug-id');
          expect(task1.modelId).toEqual(this.updatedThreadsByAccountId['123'].threads[0].id);
          expect(task1.value).toEqual({
            snoozeDate: 'date',
            snoozeCategoryId: 'sn-1',
            returnCategoryId: 'in-1',
          });

          const task2 = Actions.queueTask.calls[1].args[0];
          expect(task2.pluginId).toEqual('plug-id');
          expect(task2.modelId).toEqual(this.updatedThreadsByAccountId['321'].threads[0].id);
          expect(task2.value).toEqual({
            snoozeDate: 'date',
            snoozeCategoryId: 'sn-2',
            returnCategoryId: 'in-2',
          });
        })
      })
    });

    it('displays dialog on error', () => {
      jasmine.unspy(SnoozeUtils, 'moveThreadsToSnooze')
      spyOn(SnoozeUtils, 'moveThreadsToSnooze').andReturn(Promise.reject(new Error('Oh no!')))

      waitsForPromise(async () => {
        try {
          await this.store.onSnoozeThreads(this.threads, 'date', 'label')
        } catch (err) {
          //
        }
        expect(SnoozeUtils.moveThreadsFromSnooze).toHaveBeenCalled()
        expect(NylasEnv.reportError).toHaveBeenCalled()
        expect(NylasEnv.showErrorDialog).toHaveBeenCalled()
      });
    });
  });
})
