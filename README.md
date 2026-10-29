# @nestjs/swagger: `@ApiProperty()` on an overriding property keeps `required: false` from the parent

Minimal reproduction for an issue in [nestjs/swagger](https://github.com/nestjs/swagger).

## Steps to reproduce

```bash
npm install
npm start
```

This writes the OpenAPI spec to `api-specs/swagger-reproduction-v1.yaml`. See `repro.ts` for the three classes.

## Current behavior

When a child class overrides a property that the parent declared with `@ApiPropertyOptional()`, a bare
`@ApiProperty()` on the child does not make the property required. The generated schema keeps `required: false` from
the parent, so the property is missing from the child schema's `required` array.

```ts
class ParentWithOptionalName {
  @ApiPropertyOptional()
  name?: string;
}

class ChildWithoutRequired extends ParentWithOptionalName {
  @ApiProperty()
  override name!: string;
}
```

The generated spec has no `required` list for `ChildWithoutRequired`:

- `ChildWithoutRequired`: `@ApiProperty()` without `required`, overriding the optional parent property
- `ChildWithRequiredTrue`: `@ApiProperty({ required: true })`, overriding it
- `StandaloneWithoutRequired`: `@ApiProperty()` without `required`, no parent

```yaml
components:
  schemas:
    ChildWithRequiredTrue:
      properties:
        name:
          type: string
      required:
        - name
      type: object
    ChildWithoutRequired:
      properties:
        name:
          type: string
      type: object
    StandaloneWithoutRequired:
      properties:
        name:
          type: string
      required:
        - name
      type: object
```

The cause is in `createPropertyDecorator`. `ApiPropertyOptional()` stores `{ required: false }` on the parent. The
child decorator reads it with `Reflect.getMetadata` (which walks the prototype chain) and merges the child's options
over it. A bare `@ApiProperty()` contributes no `required` key, so the parent's `required: false` survives.

## Expected behavior

It is unclear whether this is a bug or intended, which is the reason for this report.

The same `@ApiProperty()` decorator means "required" when it is on a property with no parent (`StandaloneWithoutRequired`), and the
TypeScript type of the child (`name!: string`) is required too. A bare `@ApiProperty()` on an overriding property
silently produces an optional property instead, and nothing in the code hints at it. In a real project this dropped two
fields from the `required` list of a published OpenAPI spec without any visible change in the DTOs.

Possible resolutions, in order of preference:

1. A decorator written as `@ApiProperty(...)` without `required` resets `required` to its default (required). A child
   that wants the parent's optionality would write `@ApiPropertyOptional()`.
2. Keep the merge but document it, with a note in the inheritance section of the docs that omitted options are
   inherited, including `required`.

This is specific to `required`, where an omitted value has a meaningful default. Inheriting `description`, `example`
etc. from the parent seems natural.

## Workaround

Write `required: true` explicitly on every overriding `@ApiProperty`.

## Related

These cover the same code path (`createPropertyDecorator` in `lib/decorators/helpers.ts`) for a different option. No
existing issue about `required` being inherited was found.

- [#1321](https://github.com/nestjs/swagger/issues/1321): a re-declared `@ApiProperty()` kept the parent's `type`
- [#3840](https://github.com/nestjs/swagger/pull/3840): fixed that by using the child's `design:type` when the child has no own metadata

## Environment

- `@nestjs/swagger` 12.0.5
- NestJS 12.3.2
- Node.js 24.16.0
- TypeScript 6.0.2, with `experimentalDecorators` and `emitDecoratorMetadata` enabled and target `ES2021` (with
  `ES2022` the compiler requires `declare` on redeclared properties, because of `useDefineForClassFields`)
- macOS
