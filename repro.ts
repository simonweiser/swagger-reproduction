import 'reflect-metadata';

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
    ApiOkResponse,
    ApiProperty,
    ApiPropertyOptional,
    DocumentBuilder,
    type OpenAPIObject,
    SwaggerModule,
} from '@nestjs/swagger';
import YAML from 'yaml';

// Serializes the document as YAML 1.2 (core schema) with sorted map entries, lexicographically sorted primitive arrays
// and single quotes, so the output is stable and easy to diff.
const toYaml = (document: OpenAPIObject): string => {
    const sorted = (input: unknown): YAML.Document => {
        const sortedDocument = new YAML.Document(input, {
            aliasDuplicateObjects: false,
            prettyErrors: true,
            schema: 'core',
            sortMapEntries: true,
            strict: true,
        });

        YAML.visit(sortedDocument, {
            Seq(_key, node) {
                if (node.items.every(YAML.isScalar)) {
                    node.items.sort();
                }
            },
        });

        return sortedDocument;
    };

    return new YAML.Document(
        {
            openapi: document.openapi,
            info: document.info,
            tags: document.tags,
            servers: document.servers,
            paths: sorted(document.paths),
            components: sorted(document.components),
        },
        { aliasDuplicateObjects: false, prettyErrors: true, schema: 'core', strict: true },
    ).toString({ singleQuote: true });
};

// Writes the spec to api-specs/<app>-v<major>.yaml
const writeSpec = (document: OpenAPIObject, appName: string): void => {
    const [major] = document.info.version.split('.');
    const filePath = path.resolve('api-specs', `${appName}-v${major}.yaml`);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, toYaml(document));
};

class ParentWithOptionalName {
    @ApiPropertyOptional()
    name?: string;
}

// Overrides the optional parent property with an @ApiProperty() that sets no `required`.
class ChildWithoutRequired extends ParentWithOptionalName {
    @ApiProperty()
    override name!: string;
}

// Overrides the optional parent property with `required: true`, for comparison.
class ChildWithRequiredTrue extends ParentWithOptionalName {
    @ApiProperty({ required: true })
    override name!: string;
}

// Declared directly with an @ApiProperty() that sets no `required` and no inheritance, for comparison.
class StandaloneWithoutRequired {
    @ApiProperty()
    name!: string;
}

@Controller()
class DemoController {
    @Get('child-without-required')
    @ApiOkResponse({ type: ChildWithoutRequired })
    childWithoutRequired(): void {}

    @Get('child-with-required-true')
    @ApiOkResponse({ type: ChildWithRequiredTrue })
    childWithRequiredTrue(): void {}

    @Get('standalone-without-required')
    @ApiOkResponse({ type: StandaloneWithoutRequired })
    standaloneWithoutRequired(): void {}
}

@Module({ controllers: [DemoController] })
class AppModule {}

async function run(): Promise<void> {
    const app = await NestFactory.create(AppModule, { logger: false });
    const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('Swagger reproduction').setVersion('1.0.0').build(),
    );
    writeSpec(document, 'swagger-reproduction');
    await app.close();
}

void run();
