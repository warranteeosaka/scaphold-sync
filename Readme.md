# Scaphold Sync System _(scaphold-sync)_
[![js-standard-style][standard]](http://standardjs.com/)

[Node.js][nodejs] sync tools to deal with [scaphold.io][s] databases.

- [Installation](#installation)
- [Working with Scaphold Schemas](#scaphold)
    - [Scaphold connection setup](#s-connection)
    - [Executing Operations on Scaphold](#s-exec)
    - [Comparing the local schema to a scaphold db](#s-compare)
        - [Mapping of logicFunctions](#s-logic)
    - [Store the schema information in the `./schema` folder](#s-down)
    - [Running batch processes](#s-stream)
    - [AWS support](#s-aws)
- [Deploy Mechanism](#deploy)
    - [Inconsistency Risks](#d-risks)
- [JavaScript API](#api)
- [Contributions](#contributions)
- [License](#license)

---

<a name="installation"></a>
## Installation
Get it with [NPM][npm]!

```console
$ npm install scaphold-sync -g
```

Then you will get a `scaphold-sync` command that has quite a few options

```console
$ scaphold-sync --help
scaphold-sync <command> <options>

Commands:
  compare   Compare a scaphold database to the local schema folder.
  deploy    Update a scaphold database to match the local schema folder.
  down      Download the scaphold database to a local schema folder.
  endpoint  Get the endpoint user by serverless.
  exec      Execute a set of commands on scaphold that are piped in as JSON.
  stream    Like exec but processes input as JSON stream rather than JSON
            Object, potentially faster, potentially more dangerous.

Options:
  --appName, --name, -n         Scaphold Application Name    [string] [required]
  --region, -r                  Scaphold Region, taken from package.json if
                                available. else it will assume us-west-2.
                                                                        [string]
  --concurrency, --cops, -o     Maximum concurrent operations run against
                                scaphold.                  [number] [default: 5]
  --cwd, -c                     Folder with a package.json that contains
                                scaphold access credentials.
                                                         [string] [default: "."]
  --schemaFolder, --schema, -s  Folder to store the scaphold schema data.
                                                  [string] [default: "./schema"]
  --appId, --id, -i             Scaphold application ID, taken from package.json
                                if available                            [string]
  --help                        Show help                              [boolean]

--schemaFolder, set to "/Users/warrantee/Documents/scaphold-sync/schema", does not exist.
```

---

<a name="scaphold"></a>
## Working with scaphold schemas
`scaphold-sync` has its own, _custom_, implementation to download and store
the scaphold database schema as files. It also holds an implementation to
_compare_ the information in the files with a scaphold database and
automatically change the online database.

<a name="s-connection"></a>
### Scaphold connection setup
`scaphold-sync` **needs** the specification of three options in order to connect
to a database:

- `--region` is the region that the databases are running on at Scaphold.

    ![Scaphold regions](https://gyazo.com/783c27e4d389ea2c4505b8e094328f0f.png)

- `--appName` is the `alias` of the Scaphold database.

    ![Scaphold settings](https://gyazo.com/a75c6057cacf0dd41ea4b445582bf650.png)

- `--appId` is the application ID that Scaphold uses internally to identify the
    database. Unfortunately this is not _easy_ to find.
    You need to look in the chrome debugger:

    1. Open the Scaphold Backend.
    2. Open the Chrome Developer tools
    3. Select the Network Panel
    4. Refresh the page
    5. Look for the request to `/management` with a `getApp` query. The `id`
        is the `--appId`.

    ![Screenshot of the developer tools with the selected request][s-request]

    (↑ In above example the `id` is `QXBwOjNlNjZjYjEzLWQzMDktNDA2OC05MWVkLTgxMGQ4MjI4ZmZlMA==`)


Optionally you can store the `region` and the `appId` in the _non-standard_
property `scaphold` in your `package.json` which looks something like this:

```json
{
  "scaphold": {
    "endpoint": "<region>",
    "apps": {
      "<appName>": "<appId>"
    }
  }
}
```

If you add this to the `package.json` then you can reduce the arguments to
the `--appName`.

_Example:_ if the database is called `housewarming` then you simply add the
`--appName` option: `scaphold-sync <operation> --appName housewarming`.

**Important:** You also need a secret token!
The secret token _should never be_ stored in your project!

You will need to get it by hand from the scaphold backend:

![Screenshot of the scaphold backend showing the token section][s-token]

In order for `scaphold-sync` to work, you will need to set the
[environment variable][env-vars] `SCAPHOLD_TOKEN`. For example, like this:

```sh
env SCAPHOLD_TOKEN=0123456789ABCDEF scaphold-sync <operation> --appName housewarming
```

<a name="s-exec"></a>
#### `scaphold-sync exec` - Executing Operations on Scaphold
The `exec` command is a key command. It allows a wide range of operations on  
the scaphold database:

- [CUD][cud]* operations of any type of data.
- CUD operations on type information of the data.
- CUD operations on logic functions and integration.
- Migration operations to do as many operations in bulk as possible.

_`*` … There is no implementation of `Read` operations._

The `exec` command reads all operations as JSON data from [`stdin` ][stdin].
The JSON data is assumed to be an `Array` of operations that should be done
**in series**, one-by-one, after each-other.

Every entry is supposed to have **one** property which specifies the operation
that should be done. _Example:_ The `delete` operation deletes a database entry.
It expects a `type` attribute to know which type of data you want to delete and
`id` to delete the specific id.

`echo '[{"delete": {"type": "Role", "id": "fedcba9876543210"}}]' | scaphold-sync exec --appName houseewarming`

Breakdown of the above example:

`[{"delete": {"type": "Role", "id": "fedcba9876543210"}}]` can be written like:

```json
[
  {
    "delete": {
      "type": "Role",
      "id": "fedcba9876543210"
    }
  }
]
```

With better formatting you see that the main Array contains one entry. And the
entry's only field is the `delete` field which will be used as operation.
The object of the delete operation will be used as parameter.

_(Internal note:
It will use the [`./lib/dbDel.js`](./lib/dbDel.js) logic.)_

`echo '<data>'` will output `<data>`.

`<command-1> | <command-2>` will redirect the output of `<command-1>` to the
[`stdin`][stdin] of `<command-2>`.

Which means that `<data>` _(JSON data above)_ will be passed to the `stdin` of
`scaphold-sync exec` which will execute the `delete` operation.

Here is a list of operations supported and the types of data they operate with:

- `create` - Creates one data entry.<br/>
    The `data` is supposed to be the input as specified in the `scaphold`
    schema. Needs a `type` property to identify the type of the data entry.

- `update` - Updates one data entry.<br/>
    The `data` is supposed to be the input same as in `create`, but with an
    `id` property that tells it which entry to update.

- `delete` - Deletes one data entry.<br/>
    The `data` is supposed to be only an `id` field and a `type` for the logic
    to know what entry to delete.

- `data` - With an `id` it will do an `update`, else it will `create`.<br/>
    Similar to an `upsert` operation in other databases.

- `parallel` - Runs operations in parallel.<br/>
    By default operations are run one-by-one. Any array passed as data will be
    executed in parallel. By default max limit is `5` operations will be run in
    parallel, you can increase this by passing a number after the
    `--appId` like this: `scaphold-sync exec --appId housewarming --concurrency 20`

- `structure` - Runs a structure change operation.
    The `data`, analogous to an exec operation can contain one of the following
    attributes.

    - `createIntegration` - Creates a new [Integration][integration].<br/>
        Expects `CreateIntegrationInput` from the [Migration API][migration-api].

    - `updateIntegration` - Updates an existing integration.<br/>
        Expects `UpdateIntegrationInput` from the [Migration API][migration-api].

    - `deleteIntegration` - Deletes an existing integration.<br/>
        Expects just a `String` with the integration's name.

    - `createLogicFunction` - Creates a new [LogicFunction][logic-fn].<br/>
        Expects `CreateLogicFunctionInput` from the [Migration API][migration-api].

    - `updateLogicFunction` - Updates an existing LogicFunction.<br/>
        Expects `UpdateLogicFunctionInput` from the [Migration API][migration-api].

    - `deleteLogicFunction` - Deletes an existing LogicFunction.<br/>
        Expects to be just a `String` with the `id` of the LogicFunction.

    - `createType` - Creates a new [Type][type].<br/>
        Expects `MigrateTypeInput` from the [Migration API][migration-api].

    - `deleteType` - Deletes an existing Type.<br/>
        Expects just a `String` with the name of the Type.

    - `updateType` - Updates an existing Type.<br/>
        _Note:_ Update is a complex operations. It will deeply inspect the
        given type data to make sure that necessary operations are done in
        the right order.

    - `replaceType` - Replaces an existing Type with a different one.<br/>
        Some operations for types require that a type is deleted first before
        it is added again. _One example might be:_ if the kind of the Type
        changes from [`OBJECT`][type] to [`ENUM`][type]. Other than that it expects
        the same data as `updateType`.

- `migration` - Runs an Array of structure change operations.<br/>
    Will run a list of structure-change operations. This operation will try to
    re-arrange the operations in a way that occurs in the least actual
    operations.

    _Example:_ If you have a `createLogicFunction` operation that as a hook
    after the update of a `FOO`-Type. And you have a `createType` operation
    that creates the `FOO`-Type: `migration` would create the `FOO`-Type
    before it will create the LogicFunction, even if the order in the Array
    is otherwise.

<a name="s-compare"></a>
#### `scaphold-sync compare` - Comparing the local schema to a scaphold db
This will load the schema definition in the `./schema` folder and
compare all the Types and Integrations with the types currently existing in
the scaphold database. The output will be a list of operations needed for
`scaphold-sync exec`!

_Important:_ the current implementation is **dangerous**! For example: If a
field is _renamed_ in the filesystem and the comparison is run it will record a
**deletion** of the old field and the creation of a new field. Which means
that you would **loose the data** in all the objects with that field.

**There is currently no support for a different approach, be careful with
changes in the structure!**

<a name="s-logic"></a>
##### Mapping of logicFunctions
[LogicFunctions][logic-fn] are a special case in the structure since they are treated
by scaphold as actual URL's but those URL's need to be different for every
deployment. This is why on different computers it is very likely that you
will see an update for every LogicFunction when you run this script the first
time on your computer even though nothing changed in the `./schema` folder.

<a name="s-down"></a>
#### `scaphold-sync down` - Store the schema information in the `./schema` folder
With `down` it will download all the current information on the scaphold setup
and store it in the `./schema` folder in a custom format.

- `schema/app/[ --appName ]/integration/<integration-name>`

    Holds all the integrations that are setup. Because they need to be different
    per Scaphold database, there is a folder for every integration.

- `schema/logicFunctions/<hook>.yml`

    Holds all the setups of [LogicFunctions][logic-fn]. This is separate from `types`
    because there are non-type-related hooks as well _(i.e. `migrateSchema`)_.

- `schema/types/<Type>.yml`

    All the information on the **customizable** Types specified in Scaphold.
    Omits all the system types like `Node` that can never be customized.

- `schema/roles.yml`

    In order to implement [role-based permissions][role-permission] properly we
    need a copy of all the existing roles.

The format stored is **not** actually the same as the GraphQL types of the
[Migration API][migration-api]. It contains various changes that make it possible to sync
it to different databases _(i.e. the omission of id's)_. It will also transform
the data to make it more comfortable to edit _(i.e. fields in the GraphQL API
are supposed to be Array's but its stored as a dictionary in the file system)_.
It will omit properties that are sensible defaults and would spam the file
system.
_(i.e. logicFunctions are usually POST urls, which is why the method is omitted
if its POST)_.

By default it attempts to reduce problems with wrong ordering by _sorting all
keys alphabetically_. At some places _(specifically: the permissions)_, this is
not possible which makes the permissions harder than other parts to edit
consistently and can result in unnecessary git commits. If you happen edit the
files by hand it is a good idea to try and stay in alphabetical order as well.

<a name="s-stream"></a>
#### `scaphold-sync stream` - Running batch processes
`exec` will first read the entire JSON input and then execute each command.
This is good to ensure that the JSON input is well formatted but if you have
a large amount of operations `stream` is more efficient.

You can use `stream` like `exec`:

`echo "[{...}]" | bin/scaphold-sync stream --appName housewarming --concurrency 20`

**But** it uses [JSONStream][jsonstream] to process the statements and this will
read the array line-by-line. So, unlike in common JSON you need to make sure
that the JSON input is using one line for every statement. You can also make
it parallel by passing a concurrency parameter _(`20` in the above example)_.

<a name="s-aws"></a>
### AWS Support
It is recommended to have logic functions that work with Scaphold run in the
same [AWS-region][region] as the Scaphold database _(for performance reasons)_.

`scaphold-sync` supports Lambda functions through the [`serverless`][serverless]
framework. If the `--cwd` folder is a serverless project with
[lambda functions][lambda] and http endpoints, it supports both the deployment
and linking to [logic functions][logic-fn]!

---

<a name="deploy"></a>
## Deploy mechanism
`scaphold-sync deploy` runs [`scaphold-sync compare`](#s-compare) which
generates a set of operations run through [`scaphold-sync exec`](#s-exec).

_Note:_ It will first run `serverless deploy` if it is a serverless project.
It will deploy the all lambda functions in the `--stage` called like
the `--appName` variable. And if your logic-functions are linked to relative
URLs it will prefix them to use the prefix of the endpoint.

<a name="d-risks"></a>
### Inconsistency Risks
The deployment process is significantly quicker than any manual process but
it still takes a while to execute. Between the start of the Lambda update and
the end of Scaphold update it might take a few minutes under which any
requests to Scaphold will be using the new Lambda functions.

You can mitigate this by have many, small, deployments _(which will be faster)_.
You can also reduce the risk of problems by deploying in off-hours.

---

<a name="api"></a>
## JavaScript API

```JavaScript
const sync = require('scaphold-sync')
const options = {
  // See CLI help for details on the options
  appName: "--appName",
  appId: "--appId",
  concurrency: "--concurrency",
  cwd: '--cwd',
  schemaFolder: '--schemaFolder',
  region: '--region'
}

const promise = sync(options, function (db) {
  // In this handler you can use the db API. You will need to return
  // a promise!

  // Exec any database command
  db.exec(concurrency, operation)
  // Exec commands in parallel
  db.execAll(concurrency, operations)
  // Creates a CUD model for a scaphold type
  db.getType(typeName)

  // Creates an execution stream
  db.createStream(defaultType, concurrency)

  const structure = db.structure
  // Loads the structure of the current scaphold app
  structure.load()
  // Compares the structure of the current scaphold app to a local folder
  structure.compareToFolder(folder, concurrency)
  // Downloads the app and stores it in a folder
  structure.toFolder(folder)
  // Executes all structure operations, the app can be the app returned by .load
  structure.execAll(operations[, app])
  // Executes one structure operations, the app can be the app returned by .load
  structure.exec(operation[, app])

  // All the operations above return a Promise! Make sure that you also
  // return a promise to have clean async calls
  return Promise.resolve({})
})
```

---

<a name="contributions"></a>
## contributions

All contributions in form of [PR][prs]'s or [Issues][new-issue] are welcome!

This project is the result of an experiment which means there was no meaning
to have tests at the time of first writing it. However, the project is
structured in a way that should make the process of adding tests a breeze.
If you can contribute tests they would be very welcome!

---

<a name="license"></a>
## License

[GPL-3](./LICENSE)


[s]: https://scaphold.io
[lambda]: https://aws.amazon.com/lambda/
[nodejs]: https://nodejs.org
[npm]: https://docs.npmjs.com/getting-started/what-is-npm
[env-vars]: https://en.wikipedia.org/wiki/Environment_variable
[cud]: https://en.wikipedia.org/wiki/Create,_read,_update_and_delete
[stdin]: https://nodejs.org/api/process.html#process_process_stdin
[integration]: https://docs.scaphold.io/integrations/
[logic-fn]: https://docs.scaphold.io/custom-logic/
[type]: https://docs.scaphold.io/coredata/schema/#types
[migration-api]: https://us-west-2.api.scaphold.io/management
[serverless]: https://serverless.com/
[role-permission]: https://docs.scaphold.io/authentication/permissions/#roles
[jsonstream]: https://www.npmjs.com/package/JSONStream
[s-request]: https://gyazo.com/890052475b83498b791c1718ee4091d5.png
[s-token]: https://gyazo.com/6841c063338c8dc3fc9c7d1a83f95a09.png
[prs]: https://help.github.com/articles/about-pull-requests/
[standard]: https://img.shields.io/badge/code%20style-standard-brightgreen.svg
[new-issue]: https://github.com/warranteeosaka/scaphold-sync/issues/new
