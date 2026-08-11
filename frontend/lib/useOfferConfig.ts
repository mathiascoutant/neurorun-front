'use client'

import { useEffect, useState } from 'react'
import { fetchPublicOfferConfig, type OfferConfigPayload } from './api'
import {
  DEFAULT_OFFER_CONFIG,
  capitalize,
  mergePublicOfferConfig,
  tierLabelFromConfig,
} from './offerConfig'

/**
 * Config publique des offres (noms, prix, options). Rend d’abord les défauts — alignés sur le
 * backend — puis la config serveur dès qu’elle arrive : aucun écran n’a besoin d’état de chargement.
 */
export function usePublicOfferConfig(): OfferConfigPayload {
  const [cfg, setCfg] = useState<OfferConfigPayload>(DEFAULT_OFFER_CONFIG)

  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const incoming = await fetchPublicOfferConfig()
        if (!off) setCfg(mergePublicOfferConfig(incoming))
      } catch {
        /* garde les défauts si l’API est injoignable */
      }
    })()
    return () => {
      off = true
    }
  }, [])

  return cfg
}

/**
 * Nom commercial d’un palier, prêt à insérer dans une phrase (« Allure »). À utiliser partout où un
 * nom d’offre est affiché : l’admin peut les renommer, rien ne doit être écrit en dur.
 */
export function useTierLabel(plan: string | null | undefined): string {
  return capitalize(tierLabelFromConfig(usePublicOfferConfig(), plan))
}
