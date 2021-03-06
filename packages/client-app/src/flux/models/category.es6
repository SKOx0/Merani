/* eslint global-require: 0 */
import Model from './model';
import Attributes from '../attributes';

// We look for a few standard categories and display them in the Mailboxes
// portion of the left sidebar. Note that these may not all be present on
// a particular account.
const ToObject = (arr) => {
  return arr.reduce((o, v) => {
    o[v] = v;
    return o;
  }, {});
}

const StandardCategories = ToObject([
  "inbox",
  "important",
  "sent",
  "drafts",
  "all",
  "spam",
  "archive",
  "trash",
]);

const LockedCategories = ToObject([
  "sent",
  "drafts",
  "N1-Snoozed",
]);

const HiddenCategories = ToObject([
  "sent",
  "drafts",
  "all",
  "archive",
  "starred",
  "important",
  "N1-Snoozed",
]);

/**
Private:
This abstract class has only two concrete implementations:
  - `Folder`
  - `Label`

See the equivalent models for details.

Folders and Labels have different semantics. The `Category` class only exists to help DRY code where they happen to behave the same

## Attributes

`name`: {AttributeString} The internal name of the label or folder. Queryable.

`displayName`: {AttributeString} The display-friendly name of the label or folder. Queryable.

Section: Models
*/
export default class Category extends Model {

  get displayName() {
    if (this.path && this.path.startsWith('INBOX.')) {
      return this.path.substr(6);
    }
    if (this.path && this.path.startsWith('[Gmail]/')) {
      return this.path.substr(8);
    }
    if (this.path && this.path === 'INBOX') {
      return 'Inbox';
    }
    return this.path;
  }

  get name() {
    return this.role;
  }

  static attributes = Object.assign({}, Model.attributes, {
    role: Attributes.String({
      queryable: true,
      modelKey: 'role',
    }),
    path: Attributes.String({
      queryable: true,
      modelKey: 'path',
    }),
    localStatus: Attributes.Object({
      modelKey: 'localStatus',
    }),
  });

  static Types = {
    Standard: 'standard',
    Locked: 'locked',
    User: 'user',
    Hidden: 'hidden',
  }

  static StandardRoles = Object.keys(StandardCategories)
  static LockedCategoryNames = Object.keys(LockedCategories)
  static HiddenCategoryNames = Object.keys(HiddenCategories)

  static categoriesSharedRole(cats) {
    if (!cats || cats.length === 0) {
      return null;
    }
    const name = cats[0].name
    if (!cats.every((cat) => cat.name === name)) {
      return null;
    }
    return name;
  }

  displayType() {
    throw new Error("Base class");
  }

  hue() {
    if (!this.displayName) {
      return 0;
    }

    let hue = 0;
    for (let i = 0; i < this.displayName.length; i++) {
      hue += this.displayName.charCodeAt(i);
    }
    hue *= (396.0 / 512.0);
    return hue;
  }

  isStandardCategory(forceShowImportant) {
    let showImportant = forceShowImportant;
    if (showImportant === undefined) {
      showImportant = NylasEnv.config.get('core.workspace.showImportant');
    }
    if (showImportant === true) {
      return !!StandardCategories[this.name];
    }
    return !!StandardCategories[this.name] && (this.name !== 'important');
  }

  isLockedCategory() {
    return !!LockedCategories[this.name] || !!LockedCategories[this.displayName];
  }

  isHiddenCategory() {
    return !!HiddenCategories[this.name] || !!HiddenCategories[this.displayName];
  }

  isUserCategory() {
    return !this.isStandardCategory() && !this.isHiddenCategory();
  }

  isArchive() {
    return ['all', 'archive'].includes(this.name);
  }
}
