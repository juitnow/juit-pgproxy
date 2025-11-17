/* eslint-disable */
export interface TestSchema {
    "joined": {
        "uuid": {
            type: string;
            branding: {
                __uuid: never;
            };
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
    "main": {
        "uuid": {
            type: string;
            branding: {
                __uuid: never;
            };
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
}
