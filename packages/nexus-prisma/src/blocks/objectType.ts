import { GraphQLObjectType, GraphQLSchema, isObjectType } from 'graphql'
import { core } from 'nexus'
import { PrismaObjectTypeConfig } from '../definitions/objectType'
import { findGraphQLTypeField, getTypeName } from '../graphql'
import { objectTypeFieldsToNexus } from '../graphqlToNexus/objectType'
import {
  AddFieldInput,
  FilterInputField,
  InputField,
  ObjectTypeDetails,
  PickInputField,
  PrismaSchemaConfig,
} from '../types'
import { getFields, whitelistArgs } from '../utils'

export interface PrismaObjectDefinitionBlock<TypeName extends string>
  extends core.ObjectDefinitionBlock<TypeName> {
  /**
   * Contains all the options to use native `nexus` methods with `nexus-prisma` generated schema
   *
   * @example Pass in all the options as-is
   * ```
   * prismaObjectType({
   *   name: 'Query',
   *   definition(t) {
   *     t.field(
   *       'users',
   *       t.prismaType.users
   *     )
   *   }
   * })
   * ```
   * @example Use all the options, but overide the resolver
   *
   * ```
   * prismaObjectType({
   *   name: 'Query',
   *   definition(t) {
   *     t.field('users', {
   *       ...t.prismaType.users,
   *       resolve(root, args, ctx) {
   *         // Custom implementation
   *       }
   *     })
   *   }
   * })
   * ```
   * @example Use all the options, add more arguments with a custom resolver
   *
   * ```
   * prismaObjectType({
   *   name: 'Query',
   *   definition(t) {
   *     t.field('users', {
   *       ...t.prismaType.users,
   *       args: {
   *         ...t.prismaType.users.args,
   *         newArg: stringArg()
   *       },
   *       resolve(root, args, ctx) {
   *         // Custom implementation
   *       }
   *     })
   *   }
   * })
   * ```
   */
  prismaType: ObjectTypeDetails<TypeName>
  prismaFields(inputFields: InputField<'objectTypes', TypeName>[]): void
  prismaFields(pickFields: PickInputField<'objectTypes', TypeName>): void
  prismaFields(filterFields: FilterInputField<'objectTypes', TypeName>): void
  /**
   * Omit/customize the fields of the underlying object type
   * @param inputFields The fields you want to omit/customize
   *
   * @example Exposes only the `id` and `name` field
   *
   * t.prismaField(['id', 'name'])
   *
   * @example Exposes only the `id` and `name` field (idem-potent with above example)
   *
   * t.prismaFields({ pick: ['id', 'name'] })
   *
   * @example Exposes all fields but the `id` and `name`
   *
   * t.prismaFields({ filter: ['id', 'name'] })
   *
   * @example Exposes the only the `users` field, and alias it to `customers`
   *
   * t.prismaFields([{ name: 'users', alias: 'customers' }])
   *
   * @example Exposes only the `users` field, and only the `first` and `last` args
   *
   * t.prismaFields([{ name: 'users', args: ['first', 'last'] }])
   *
   */
  prismaFields(inputFields: AddFieldInput<'objectTypes', TypeName>): void
}

interface InternalPrismaObjectDefinitionBlock<TypeName extends string>
  extends PrismaObjectDefinitionBlock<TypeName> {
  __calledPrismaFields: boolean
}

export function prismaObjectDefinitionBlock<TypeName extends string>(
  typeName: string,
  t: core.ObjectDefinitionBlock<TypeName>,
  prismaType: Record<string, core.NexusOutputFieldConfig<string, string>>,
  prismaSchema: GraphQLSchema,
): InternalPrismaObjectDefinitionBlock<TypeName> {
  const prismaBlock = t as InternalPrismaObjectDefinitionBlock<TypeName>

  prismaBlock.prismaType = prismaType
  prismaBlock.prismaFields = (inputFields: any) => {
    prismaBlock.__calledPrismaFields = true
    const graphqlType = prismaSchema.getType(typeName) as GraphQLObjectType
    const fields = getFields(inputFields, typeName, prismaSchema)

    graphqlType.getInterfaces().forEach(interfaceType => {
      prismaBlock.implements(interfaceType.name)
    })
    fields.forEach(field => {
      const aliasName = field.alias ? field.alias : field.name
      const fieldType = findGraphQLTypeField(typeName, field.name, prismaSchema)
      const { list, ...rest } = prismaType[fieldType.name]
      const args = whitelistArgs(rest.args!, field.args)
      prismaBlock.field(aliasName, {
        ...rest,
        type: getTypeName(fieldType.type),
        list: list ? true : undefined,
        args,
      })
    })
  }

  return prismaBlock
}

export function prismaTypeObject(
  prismaSchema: {
    uniqueFieldsByModel: Record<string, string[]>
    schema: GraphQLSchema
  },
  objectConfig: PrismaObjectTypeConfig<any>,
  builderConfig: PrismaSchemaConfig,
) {
  const typeName = objectConfig.name
  const graphqlType = prismaSchema.schema.getType(typeName)

  if (!isObjectType(graphqlType)) {
    throw new Error(
      `\
Must select a GraphQLObjectType, saw ${typeName} which is ${graphqlType}.
Are you trying to create a new type? Use \`objectType\` instead of \`prismaObjectType\`
`,
    )
  }

  return objectTypeFieldsToNexus(
    graphqlType,
    builderConfig.prisma.client,
    prismaSchema.uniqueFieldsByModel,
  )
}
