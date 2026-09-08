import {
  createCollector,
} from "../collectors/factory.js";

import {
  runCompanyScan,
} from "./run-company-scan.js";

import type {
  CompanyScanResult,
} from "./run-company-scan.js";


type CompanyScanConfigurationRow = {
  id: string;

  collectorType: string;

  sourceKey: string | null;

  isActive: number;
};


export async function runConfiguredCompanyScan(
  db: D1Database,
  companyId: string,
): Promise<CompanyScanResult> {
  const company = await db
    .prepare(`
      SELECT
        id,

        collector_type
          AS collectorType,

        source_key
          AS sourceKey,

        is_active
          AS isActive

      FROM companies

      WHERE id = ?

      LIMIT 1
    `)
    .bind(companyId)
    .first<CompanyScanConfigurationRow>();


  if (!company) {
    throw new Error(
      `Unknown company: ${companyId}`,
    );
  }


  if (company.isActive !== 1) {
    throw new Error(
      `Company ${companyId} is inactive`,
    );
  }


  const collector =
    createCollector({
      companyId:
        company.id,

      collectorType:
        company.collectorType,

      sourceKey:
        company.sourceKey,
    });


  return runCompanyScan(
    db,
    company.id,
    collector,
  );
}