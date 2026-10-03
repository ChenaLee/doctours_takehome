import type { ToolDefinition } from "../types.js";
import {
  getAllClinics,
  getClinicDoctors,
  getClinicPackages,
  getConsultationRescheduleLink,
  getFullCalls,
  getLatestAssessment,
  getPatientContext,
  getPatientImages,
  getPaymentLink,
  getSavedClinics,
  issuePromoCode,
  updateUser,
  updateUserClinicPreferences,
  updateWorkingMemory,
} from "./index.js";

export const toolRegistry: Record<string, ToolDefinition> = {
  getAllClinics: {
    fn: () => getAllClinics(),
    description:
      "Returns all partner clinics with IDs, names, addresses, flags, and specialties",
  },
  getClinicDoctors: {
    fn: (input) =>
      getClinicDoctors(input as { clinicId?: string; clinicName?: string }),
    description:
      "Returns doctors for a clinic (accepts clinicId or clinicName)",
  },
  getClinicPackages: {
    fn: (input) =>
      getClinicPackages(input as { clinicId?: string; clinicName?: string }),
    description:
      "Returns packages with names, prices, deposits, and addons for a clinic",
  },
  getConsultationRescheduleLink: {
    fn: (input) =>
      getConsultationRescheduleLink(input as { userId?: string }),
    description: "Returns a consultation reschedule link (or no_consultation)",
  },
  getFullCalls: {
    fn: (input) =>
      getFullCalls(input as { chatId?: string; limit?: number }),
    description:
      "Returns full call logs with summaries and transcripts",
  },
  getLatestAssessment: {
    fn: (input) => getLatestAssessment(input as { userId?: string }),
    description:
      "Returns assessment link, graft range, and share status",
  },
  getPatientContext: {
    fn: (input) => getPatientContext(input as { userId?: string }),
    description:
      "Returns patient profile, pipeline status, and clinic/package preferences",
  },
  getPatientImages: {
    fn: (input) => getPatientImages(input as { userId?: string }),
    description:
      "Returns which intake photo angles have been uploaded",
  },
  getPaymentLink: {
    fn: (input) =>
      getPaymentLink(
        input as { clinicPackageId?: string; type?: string; clinicId?: string },
      ),
    description:
      "Returns a deposit payment or checkout URL (type: payment or checkout)",
  },
  getSavedClinics: {
    fn: (input) => getSavedClinics(input as { userId?: string }),
    description:
      "Returns the patient's recommended/saved clinics with rankings",
  },
  issuePromoCode: {
    fn: (input) => issuePromoCode(input as { userId?: string }),
    description: "Attempts to issue a promo code for the patient",
  },
  updateUser: {
    fn: (input) =>
      updateUser(
        input as { firstName?: string; lastName?: string; userId?: string },
      ),
    description: "Updates patient name (only if not already set)",
  },
  updateUserClinicPreferences: {
    fn: (input) =>
      updateUserClinicPreferences(
        input as { clinicSelection?: Record<string, unknown>; userId?: string },
      ),
    description:
      "Saves clinic/package selection and tentative procedure dates",
  },
  updateWorkingMemory: {
    fn: (input) =>
      updateWorkingMemory(input as { memory?: Record<string, unknown> }),
    description: "Persists working memory updates for conversation continuity",
  },
};

export function callTool(
  name: string,
  args: Record<string, unknown>,
): unknown {
  const tool = toolRegistry[name];
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return tool.fn(args);
}
