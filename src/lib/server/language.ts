import * as z from 'zod';
import { LANG_ERROR, langSchema } from '$lib/i18n';

/** Body of `POST /api/language`. */
export const languageBodySchema = z.object({ lang: langSchema }, { error: LANG_ERROR });
