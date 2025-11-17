/* eslint-disable */
export interface TestSchema {
    "joined": {
        "uuid": {
            type: string;
            branding: {
                __uuid: never;
            };
            hasDefault: true;
        };
        "key": {
            type: string;
        };
        "date": {
            type: Date;
            isNullable: true;
        };
        "json": {
            type: any;
            isNullable: true;
        };
    };
    "links": {
        "uuid": {
            type: string;
            branding: {
                __uuid: never;
            };
            hasDefault: true;
        };
        "ref_main": {
            type: string;
            branding: {
                __uuid: never;
            };
        };
        "ref_joined": {
            type: string;
            branding: {
                __uuid: never;
            };
        };
        "label": {
            type: string;
        };
    };
    "main": {
        "uuid": {
            type: string;
            branding: {
                __uuid: never;
            };
            hasDefault: true;
        };
        "ref": {
            type: string;
            branding: {
                __uuid: never;
            };
            isNullable: true;
        };
        "key": {
            type: string;
        };
        "date": {
            type: Date;
        };
        "number": {
            type: number;
            isNullable: true;
        };
        "json": {
            type: any;
            isNullable: true;
        };
    };
    "many": {
        "uuid": {
            type: string;
            branding: {
                __uuid: never;
            };
            hasDefault: true;
        };
        "ref_main": {
            type: string;
            branding: {
                __uuid: never;
            };
        };
        "detail": {
            type: string;
        };
    };
}
