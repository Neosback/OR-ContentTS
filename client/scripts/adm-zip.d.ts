declare module "adm-zip" {
    class AdmZip {
        constructor(input?: Buffer);
        extractEntryTo(
            entryName: string,
            targetPath: string,
            maintainEntryPath: boolean,
            overwrite?: boolean,
        ): boolean;
    }

    export default AdmZip;
}
