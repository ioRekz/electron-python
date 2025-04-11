import sqlite3 from 'sqlite3'
import log from 'electron-log'

/**
 * Get species distribution from the database
 * @param {string} dbPath - Path to the SQLite database
 * @returns {Promise<Array>} - Species distribution data
 */
export async function getSpeciesDistribution(dbPath) {
  return new Promise((resolve, reject) => {
    log.info(`Querying species distribution from: ${dbPath}`)

    // Open the database
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        log.error(`Error opening database: ${err.message}`)
        return reject(err)
      }

      // Query to count occurrences by species
      const query = `
        SELECT
          scientificName,
          COUNT(*) as count
        FROM observations
        WHERE scientificName IS NOT NULL AND scientificName != ''
        GROUP BY scientificName
        ORDER BY count DESC
      `

      db.all(query, [], (err, rows) => {
        // Close the database
        db.close()

        if (err) {
          log.error(`Error querying database: ${err.message}`)
          return reject(err)
        }

        log.info(`Retrieved species distribution: ${rows.length} species found`)
        resolve(rows)
      })
    })
  })
}

/**
 * Get deployment information from the database
 * @param {string} dbPath - Path to the SQLite database
 * @returns {Promise<Array>} - Deployment data
 */
export async function getDeployments(dbPath) {
  return new Promise((resolve, reject) => {
    log.info(`Querying deployments from: ${dbPath}`)

    // Open the database
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        log.error(`Error opening database: ${err.message}`)
        return reject(err)
      }

      // Query to get deployments with location name, dates and coordinates
      const query = `
        SELECT
          locationName,
          locationID,
          deploymentID,
          deploymentStart,
          deploymentEnd,
          longitude,
          latitude
        FROM deployments
        ORDER BY deploymentStart DESC
      `

      db.all(query, [], (err, rows) => {
        // Close the database
        db.close()

        if (err) {
          log.error(`Error querying deployments: ${err.message}`)
          return reject(err)
        }

        log.info(`Retrieved deployments: ${rows.length} found`)
        resolve(rows)
      })
    })
  })
}

/**
 * Get activity data (observation counts) per deployment over time periods
 * @param {string} dbPath - Path to the SQLite database
 * @returns {Promise<Object>} - Activity data with periods and counts per deployment
 */
export async function getDeploymentsActivity(dbPath) {
  return new Promise((resolve, reject) => {
    log.info(`Querying deployment activity from: ${dbPath}`)

    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        log.error(`Error opening database: ${err.message}`)
        return reject(err)
      }

      // First get the total date range to calculate period size
      const dateRangeQuery = `
        SELECT 
          MIN(deploymentStart) as minDate,
          MAX(deploymentEnd) as maxDate
        FROM deployments
      `

      db.get(dateRangeQuery, [], (err, dateRange) => {
        if (err) {
          db.close()
          log.error(`Error getting date range: ${err.message}`)
          return reject(err)
        }

        // Get all deployments
        const deploymentsQuery = `
          SELECT
            deploymentID,
            locationName,
            locationID,
            deploymentStart,
            deploymentEnd,
            longitude,
            latitude
          FROM deployments
        `

        db.all(deploymentsQuery, [], (err, deployments) => {
          if (err) {
            db.close()
            log.error(`Error querying deployments: ${err.message}`)
            return reject(err)
          }

          // Get all observations with their deployment IDs and event start times
          const observationsQuery = `
            SELECT
              deploymentID,
              eventID,
              eventStart
            FROM observations
          `

          db.all(observationsQuery, [], (err, observations) => {
            db.close()

            if (err) {
              log.error(`Error querying observations: ${err.message}`)
              return reject(err)
            }

            // Process the data in JavaScript
            const minDate = new Date(dateRange.minDate)
            const maxDate = new Date(dateRange.maxDate)
            const totalDays = (maxDate - minDate) / (1000 * 60 * 60 * 24)
            const periodDays = Math.ceil(totalDays / 20)

            // Generate periods
            const periods = []
            let currentStart = new Date(minDate)
            
            while (currentStart < maxDate) {
              const periodEnd = new Date(currentStart)
              periodEnd.setDate(periodEnd.getDate() + periodDays)
              
              periods.push({
                start: currentStart.toISOString(),
                end: periodEnd.toISOString()
              })
              
              currentStart = new Date(periodEnd)
            }

            // Create deployment map
            const deploymentMap = new Map()
            deployments.forEach(deployment => {
              deploymentMap.set(deployment.deploymentID, {
                deploymentID: deployment.deploymentID,
                locationName: deployment.locationName,
                locationID: deployment.locationID,
                deploymentStart: deployment.deploymentStart,
                deploymentEnd: deployment.deploymentEnd,
                longitude: deployment.longitude,
                latitude: deployment.latitude,
                periods: periods.map(period => ({
                  start: period.start,
                  end: period.end,
                  count: 0
                }))
              })
            })

            // Count observations per deployment per period
            const allCounts = []
            
            observations.forEach(obs => {
              const deployment = deploymentMap.get(obs.deploymentID)
              if (!deployment) return
              
              const obsDate = new Date(obs.eventStart)
              
              for (let i = 0; i < periods.length; i++) {
                const periodStart = new Date(periods[i].start)
                const periodEnd = new Date(periods[i].end)
                
                if (obsDate >= periodStart && obsDate < periodEnd) {
                  deployment.periods[i].count++
                  break
                }
              }
            })
            
            // Collect all non-zero counts for percentile calculation
            deploymentMap.forEach(deployment => {
              deployment.periods.forEach(period => {
                if (period.count > 0) {
                  allCounts.push(period.count)
                }
              })
            })

            // Sort counts for percentile calculations
            allCounts.sort((a, b) => a - b)

            // Calculate 95th percentile of period counts
            const percentile95Index = Math.floor(allCounts.length * 0.95)
            const percentile90Count = allCounts[percentile95Index] || 1

            const result = {
              startDate: dateRange.minDate,
              endDate: dateRange.maxDate,
              percentile90Count,
              deployments: Array.from(deploymentMap.values())
            }

            log.info(`Retrieved deployment activity data for ${result.deployments.length} deployments`)
            resolve(result)
          })
        })
      })
    })
  })
}
