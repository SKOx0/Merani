_ = require 'underscore'
React = require "react"
ReactDOM = require 'react-dom'
ReactTestUtils = require 'react-dom/test-utils'
MovePickerPopover = require('../lib/move-picker-popover').default

{Utils,
 Category,
 Folder,
 Thread,
 Actions,
 AccountStore,
 CategoryStore,
 DatabaseStore,
 TaskFactory,
 SyncbackCategoryTask,
 FocusedPerspectiveStore,
 MailboxPerspective,
 NylasTestUtils,
 TaskQueue} = require 'nylas-exports'

{Categories} = require 'nylas-observables'

describe 'MovePickerPopover', ->
  beforeEach ->
    CategoryStore._categoryCache = {}

  setupFor = () ->
    @account = {
      id: TEST_ACCOUNT_ID
    }

    @inboxCategory = new Folder(id: 'id-123', role: 'inbox', path: "INBOX", accountId: TEST_ACCOUNT_ID)
    @archiveCategory = new Folder(id: 'id-456', role: 'archive', path: "ArCHIVe", accountId: TEST_ACCOUNT_ID)
    @userCategory = new Folder(id: 'id-789', role: null, path: "MyCategory", accountId: TEST_ACCOUNT_ID)

    observable = NylasTestUtils.mockObservable([@inboxCategory, @archiveCategory, @userCategory])
    observable.sort = => observable

    spyOn(Categories, "forAccount").andReturn observable
    spyOn(CategoryStore, "getCategoryByRole").andReturn @inboxCategory
    spyOn(AccountStore, "accountForItems").andReturn @account
    spyOn(Actions, "closePopover")

    # By default we're going to set to "inbox". This has implications for
    # what categories get filtered out of the list.
    spyOn(FocusedPerspectiveStore, 'current').andCallFake =>
      MailboxPerspective.forCategory(@inboxCategory)

  setupForCreateNew = () ->
    setupFor.call(@)

    @testThread = new Thread(id: 't1', subject: "fake", accountId: TEST_ACCOUNT_ID, categories: [])
    @picker = ReactTestUtils.renderIntoDocument(
      <MovePickerPopover threads={[@testThread]} account={@account} />
    )

  describe 'when using folders', ->
    beforeEach ->
      setupFor.call(@)

      @testThread = new Thread(id: 't1', subject: "fake", accountId: TEST_ACCOUNT_ID, categories: [])
      @picker = ReactTestUtils.renderIntoDocument(
        <MovePickerPopover threads={[@testThread]} account={@account} />
      )

    it 'lists the desired categories', ->
      data = @picker.state.categoryData
      # NOTE: The inbox category is not included here because it's the
      # currently focused category, which gets filtered out of the list.
      expect(data.length).toBe 3

      expect(data[0].id).toBe "id-456"
      expect(data[0].name).toBe "archive"
      expect(data[0].category).toBe @archiveCategory

      expect(data[1].divider).toBe true
      expect(data[1].id).toBe "category-divider"

      expect(data[2].id).toBe "id-789"
      expect(data[2].name).toBeUndefined()
      expect(data[2].category).toBe @userCategory

  describe "'create new' item", ->
    beforeEach ->
      setupForCreateNew.call @

    it "is not visible when the search box is empty", ->
      count = ReactTestUtils.scryRenderedDOMComponentsWithClass(@picker, 'category-create-new').length
      expect(count).toBe 0

    it "is visible when the search box has text", ->
      inputNode = ReactDOM.findDOMNode(ReactTestUtils.scryRenderedDOMComponentsWithTag(@picker, "input")[0])
      ReactTestUtils.Simulate.change inputNode, target: { value: "calendar" }
      count = ReactTestUtils.scryRenderedDOMComponentsWithClass(@picker, 'category-create-new').length
      expect(count).toBe 1

    it "shows folder icon if we're using exchange", ->
      inputNode = ReactDOM.findDOMNode(ReactTestUtils.scryRenderedDOMComponentsWithTag(@picker, "input")[0])
      ReactTestUtils.Simulate.change inputNode, target: { value: "calendar" }
      count = ReactTestUtils.scryRenderedDOMComponentsWithClass(@picker, 'category-create-new-folder').length
      expect(count).toBe 1

  describe "_onSelectCategory", ->
    beforeEach ->
      setupForCreateNew.call @
      spyOn(TaskFactory, 'taskForRemovingCategory').andCallThrough()
      spyOn(TaskFactory, 'tasK').andCallThrough()
      spyOn(Actions, "queueTask")

    it "closes the popover", ->
      @picker._onSelectCategory { usage: 0, category: "asdf" }
      expect(Actions.closePopover).toHaveBeenCalled()

    describe "when selecting a category currently on all the selected items", ->
      it "fires a task to remove the category", ->
        input =
          category: "asdf"
          usage: 1

        @picker._onSelectCategory(input)
        expect(TaskFactory.taskForRemovingCategory).toHaveBeenCalledWith
          threads: [@testThread]
          category: "asdf"
        expect(Actions.queueTask).toHaveBeenCalled()

    describe "when selecting a category not on all the selected items", ->
      it "fires a task to add the category", ->
        input =
          category: "asdf"
          usage: 0

        @picker._onSelectCategory(input)
        expect(TaskFactory.taskForApplyingCategory).toHaveBeenCalledWith
          threads: [@testThread]
          category: "asdf"
        expect(Actions.queueTask).toHaveBeenCalled()

    describe "when selecting a new category", ->
      beforeEach ->
        @input =
          newCategoryItem: true
        @picker.setState(searchValue: "teSTing!")

      it "queues a new syncback task for creating a category", ->
        @picker._onSelectCategory(@input)
        expect(Actions.queueTask).toHaveBeenCalled()
        syncbackTask = Actions.queueTask.calls[0].args[0]
        newCategory  = syncbackTask.category
        expect(newCategory instanceof Category).toBe(true)
        expect(newCategory.displayName).toBe "teSTing!"
        expect(newCategory.accountId).toBe TEST_ACCOUNT_ID

      it "queues a task for applying the category after it has saved", ->
        category = false
        resolveSave = false
        spyOn(TaskQueue, "waitForPerformRemote").andCallFake (task) ->
          expect(task instanceof SyncbackCategoryTask).toBe true
          new Promise (resolve, reject) ->
            resolveSave = resolve

        spyOn(DatabaseStore, "findBy").andCallFake (klass, {id}) ->
          expect(klass).toBe(Category)
          expect(typeof id).toBe("string")
          Promise.resolve(category)

        @picker._onSelectCategory(@input)

        waitsFor ->
          Actions.queueTask.callCount > 0

        runs ->
          category = Actions.queueTask.calls[0].args[0].category
          resolveSave()

        waitsFor ->
          TaskFactory.taskForApplyingCategory.calls.length is 1

        runs ->
          expect(TaskFactory.taskForApplyingCategory).toHaveBeenCalledWith
            threads: [@testThread]
            category: category
