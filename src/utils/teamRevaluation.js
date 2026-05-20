const adjustedFields = [
  'recentForm',
  'morale',
  'fatigue',
  'attackRating',
  'defenseRating',
]

function clampScore(value) {
  return Math.min(Math.max(Math.round(value), 0), 100)
}

function getOutcome(match) {
  if (!match.score) return null
  if (match.score.home > match.score.away) return 'home'
  if (match.score.home < match.score.away) return 'away'
  return 'draw'
}

function getChangeWithinRange(rawValue, min, max) {
  return clampScore(Math.min(Math.max(rawValue, min), max))
}

function getUpsetBonus(winnerOdds, loserOdds) {
  const winner = Number(winnerOdds) || 1
  const loser = Number(loserOdds) || 1

  if (winner <= loser) return 0
  return Math.min((winner - loser) / 1.6, 2.4)
}

function getStrengthBonus(winnerStrength, loserStrength) {
  if (winnerStrength >= loserStrength) return 0
  return Math.min((loserStrength - winnerStrength) / 10, 1.4)
}

function createAdjustmentRecord(team) {
  return {
    id: team.id,
    name: team.name,
    original: Object.fromEntries(adjustedFields.map((field) => [field, team[field]])),
    adjusted: null,
    reasons: [],
  }
}

function adjustTeam(team, updates) {
  Object.entries(updates).forEach(([field, delta]) => {
    team[field] = clampScore(team[field] + delta)
  })
}

function addReason(records, teamId, reason) {
  records.get(teamId)?.reasons.push(reason)
}

function applyAdjustmentsFromMatches(teams, finishedMatches) {
  const adjustedTeams = teams.map((team) => ({ ...team }))
  const teamMap = new Map(adjustedTeams.map((team) => [team.id, team]))
  const records = new Map(teams.map((team) => [team.id, createAdjustmentRecord(team)]))

  finishedMatches.forEach((match) => {
    const homeTeam = teamMap.get(match.homeTeamId)
    const awayTeam = teamMap.get(match.awayTeamId)
    if (!homeTeam || !awayTeam) return

    const homeGoals = match.score.home
    const awayGoals = match.score.away
    const goalDiff = Math.abs(homeGoals - awayGoals)

    adjustTeam(homeTeam, { fatigue: 4 })
    adjustTeam(awayTeam, { fatigue: 4 })
    addReason(records, homeTeam.id, `${match.stage} 完赛，体能消耗 fatigue +4`)
    addReason(records, awayTeam.id, `${match.stage} 完赛，体能消耗 fatigue +4`)

    const outcome = getOutcome(match)

    if (outcome === 'draw') {
      const strengthGap = Math.abs(homeTeam.teamStrength - awayTeam.teamStrength)
      if (strengthGap >= 8) {
        const strongTeam =
          homeTeam.teamStrength > awayTeam.teamStrength ? homeTeam : awayTeam
        const weakTeam = strongTeam.id === homeTeam.id ? awayTeam : homeTeam
        adjustTeam(strongTeam, { recentForm: -2, morale: -2 })
        adjustTeam(weakTeam, { recentForm: 3, morale: 3 })
        addReason(
          records,
          strongTeam.id,
          `强队战平弱队，recentForm -2，morale -2`,
        )
        addReason(
          records,
          weakTeam.id,
          `弱队逼平强队，recentForm +3，morale +3`,
        )
      } else {
        adjustTeam(homeTeam, { recentForm: 1, morale: 1 })
        adjustTeam(awayTeam, { recentForm: 1, morale: 1 })
        addReason(records, homeTeam.id, `接近实力平局，recentForm +1，morale +1`)
        addReason(records, awayTeam.id, `接近实力平局，recentForm +1，morale +1`)
      }
      return
    }

    const winner = outcome === 'home' ? homeTeam : awayTeam
    const loser = outcome === 'home' ? awayTeam : homeTeam
    const winnerOdds = outcome === 'home' ? match.odds?.home : match.odds?.away
    const loserOdds = outcome === 'home' ? match.odds?.away : match.odds?.home
    const upsetBonus = getUpsetBonus(winnerOdds, loserOdds)
    const strengthBonus = getStrengthBonus(winner.teamStrength, loser.teamStrength)
    const marginBonus = goalDiff >= 2 ? 1 : 0
    const winFormDelta = getChangeWithinRange(
      2 + upsetBonus + strengthBonus + marginBonus,
      2,
      5,
    )
    const winMoraleDelta = getChangeWithinRange(
      2 + upsetBonus * 1.25 + strengthBonus + marginBonus,
      2,
      6,
    )
    const loseFormDelta = -getChangeWithinRange(
      2 + upsetBonus * 0.8 + strengthBonus + marginBonus,
      2,
      5,
    )
    const loseMoraleDelta = -getChangeWithinRange(
      2 + upsetBonus + strengthBonus + marginBonus,
      2,
      6,
    )

    adjustTeam(winner, {
      recentForm: winFormDelta,
      morale: winMoraleDelta,
    })
    adjustTeam(loser, {
      recentForm: loseFormDelta,
      morale: loseMoraleDelta,
    })
    addReason(
      records,
      winner.id,
      `赢球，结合对手强度与赛前赔率冷门程度，recentForm +${winFormDelta}，morale +${winMoraleDelta}`,
    )
    addReason(
      records,
      loser.id,
      `输球，结合对手强度与赛前赔率冷门程度，recentForm ${loseFormDelta}，morale ${loseMoraleDelta}`,
    )

    if (goalDiff >= 2) {
      adjustTeam(winner, { attackRating: 2 })
      adjustTeam(loser, { defenseRating: -2 })
      addReason(records, winner.id, `净胜 2 球以上，attackRating +2`)
      addReason(records, loser.id, `净负 2 球以上，defenseRating -2`)
    }

    const winnerConceded = outcome === 'home' ? awayGoals : homeGoals
    if (winnerConceded === 0) {
      adjustTeam(winner, { defenseRating: 2 })
      addReason(records, winner.id, `零封对手，defenseRating +2`)
    }
  })

  const adjustmentRows = adjustedTeams.map((team) => {
    const record = records.get(team.id)
    return {
      ...record,
      adjusted: Object.fromEntries(adjustedFields.map((field) => [field, team[field]])),
      reason: record.reasons.length ? record.reasons.join('；') : '暂无 finished 比赛影响',
    }
  })

  return {
    adjustedTeams,
    adjustmentRows,
  }
}

export function applyFinishedMatchAdjustments(teams, matches) {
  const finishedMatches = matches.filter(
    (match) => match.status === 'finished' && match.score,
  )

  return applyAdjustmentsFromMatches(teams, finishedMatches)
}

export function applyFinishedMatchAdjustmentsBefore(teams, matches, cutoffKickoff) {
  const cutoffTime = new Date(cutoffKickoff).getTime()
  const finishedMatchesBeforeCutoff = matches.filter(
    (match) =>
      match.status === 'finished' &&
      match.score &&
      new Date(match.kickoff).getTime() < cutoffTime,
  )

  return applyAdjustmentsFromMatches(teams, finishedMatchesBeforeCutoff)
}
