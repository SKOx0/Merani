_ = require 'underscore'
React = require 'react'
ReactDOM = require 'react-dom'

{Actions,
 AccountStore,
 WorkspaceStore} = require 'nylas-exports'

{RetinaImg,
 KeyCommandsRegion} = require 'nylas-component-kit'

LabelPickerPopover = require('./label-picker-popover').default


# This changes the category on one or more threads.
class LabelPicker extends React.Component
  @displayName: "LabelPicker"

  @containerRequired: false

  @propTypes:
    items: React.PropTypes.array

  @contextTypes:
    sheetDepth: React.PropTypes.number

  constructor: (@props) ->
    @_account = AccountStore.accountForItems(@props.items)

  # If the threads we're picking categories for change, (like when they
  # get their categories updated), we expect our parents to pass us new
  # props. We don't listen to the DatabaseStore ourselves.
  componentWillReceiveProps: (nextProps) ->
    @_account = AccountStore.accountForItems(nextProps.items)

  _keymapHandlers: ->
    "core:change-category": @_onOpenCategoryPopover

  _onOpenCategoryPopover: =>
    return unless @props.items.length > 0
    return unless @context.sheetDepth is WorkspaceStore.sheetStack().length - 1
    buttonRect = this._buttonEl.getBoundingClientRect()
    Actions.openPopover(
      <LabelPickerPopover
        threads={@props.items}
        account={@_account} />,
      {originRect: buttonRect, direction: 'down'}
    )
    return

  render: =>
    return <span /> unless @_account
    btnClasses = "btn btn-toolbar btn-category-picker"

    return (
      <KeyCommandsRegion
        style={order: -103}
        globalHandlers={@_keymapHandlers()}
        globalMenuItems={[
          {
            "label": "Thread",
            "submenu": [{ "label": "Apply Labels...", "command": "core:change-category", "position": "endof=thread-actions" }]
          }
        ]}
        >
        <button
          tabIndex={-1}
          ref={(el) => this._buttonEl = el}
          title={"Apply Labels"}
          onClick={@_onOpenCategoryPopover}
          className={btnClasses} >
          <RetinaImg name={"toolbar-tag.png"} mode={RetinaImg.Mode.ContentIsMask}/>
        </button>
      </KeyCommandsRegion>
    )


module.exports = LabelPicker
