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
 * @returns {Promise<Array>} - Deployment data with one row per location
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

      // Query to get distinct deployments by locationID
      // This will return the first (most recent) deployment for each location
      const query = `
        SELECT DISTINCT
          locationID,
          locationName,
          deploymentID,
          deploymentStart,
          deploymentEnd,
          longitude,
          latitude
        FROM (
          SELECT
            locationName,
            locationID,
            deploymentID,
            deploymentStart,
            deploymentEnd,
            longitude,
            latitude
          FROM deployments
          ORDER BY locationID, deploymentStart DESC
        )
        GROUP BY locationID
      `

      db.all(query, [], (err, rows) => {
        // Close the database
        db.close()

        if (err) {
          log.error(`Error querying deployments: ${err.message}`)
          return reject(err)
        }

        log.info(`Retrieved distinct deployments: ${rows.length} locations found`)
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
            deployments.forEach((deployment) => {
              deploymentMap.set(deployment.deploymentID, {
                deploymentID: deployment.deploymentID,
                locationName: deployment.locationName,
                locationID: deployment.locationID,
                deploymentStart: deployment.deploymentStart,
                deploymentEnd: deployment.deploymentEnd,
                longitude: deployment.longitude,
                latitude: deployment.latitude,
                periods: periods.map((period) => ({
                  start: period.start,
                  end: period.end,
                  count: 0
                }))
              })
            })

            // Count observations per deployment per period
            const allCounts = []

            observations.forEach((obs) => {
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
            deploymentMap.forEach((deployment) => {
              deployment.periods.forEach((period) => {
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

            log.info(
              `Retrieved deployment activity data for ${result.deployments.length} deployments`
            )
            resolve(result)
          })
        })
      })
    })
  })
}

/**
 * Get activity data (observation counts) per location over time periods
 * @param {string} dbPath - Path to the SQLite database
 * @returns {Promise<Object>} - Activity data with periods and counts per location
 */
export async function getLocationsActivity(dbPath) {
  return new Promise((resolve, reject) => {
    log.info(`Querying location activity from: ${dbPath}`)

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

        // Get all locations
        const locationsQuery = `
          SELECT DISTINCT
            locationID,
            locationName,
            longitude,
            latitude
          FROM deployments
        `

        db.all(locationsQuery, [], (err, locations) => {
          if (err) {
            db.close()
            log.error(`Error querying locations: ${err.message}`)
            return reject(err)
          }

          // Get all observations with their location IDs and event start times
          const observationsQuery = `
            SELECT
              d.locationID,
              o.eventID,
              o.eventStart
            FROM observations o
            JOIN deployments d ON o.deploymentID = d.deploymentID
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

            // Create location map
            const locationMap = new Map()
            locations.forEach((location) => {
              locationMap.set(location.locationID, {
                locationID: location.locationID,
                locationName: location.locationName,
                longitude: location.longitude,
                latitude: location.latitude,
                periods: periods.map((period) => ({
                  start: period.start,
                  end: period.end,
                  count: 0
                }))
              })
            })

            // Count observations per location per period
            const allCounts = []

            observations.forEach((obs) => {
              const location = locationMap.get(obs.locationID)
              if (!location) return

              const obsDate = new Date(obs.eventStart)

              for (let i = 0; i < periods.length; i++) {
                const periodStart = new Date(periods[i].start)
                const periodEnd = new Date(periods[i].end)

                if (obsDate >= periodStart && obsDate < periodEnd) {
                  location.periods[i].count++
                  break
                }
              }
            })

            // Collect all non-zero counts for percentile calculation
            locationMap.forEach((location) => {
              location.periods.forEach((period) => {
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
              locations: Array.from(locationMap.values())
            }

            log.info(`Retrieved location activity data for ${result.locations.length} locations`)
            resolve(result)
          })
        })
      })
    })
  })
}

/**
 * Get daily timeseries data for top species by observation count
 * @param {string} dbPath - Path to the SQLite database
 * @returns {Promise<Object>} - Timeseries data for top species
 */
export async function getTopSpeciesTimeseries(dbPath) {
  return new Promise((resolve, reject) => {
    log.info(`Querying top species timeseries from: ${dbPath}`)

    // Open the database
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        log.error(`Error opening database: ${err.message}`)
        return reject(err)
      }

      // First, identify all species by observation count
      const speciesQuery = `
        SELECT
          scientificName,
          COUNT(*) as count
        FROM observations
        WHERE scientificName IS NOT NULL AND scientificName != ''
        GROUP BY scientificName
        ORDER BY count DESC
      `

      db.all(speciesQuery, [], (err, allSpecies) => {
        if (err) {
          db.close()
          log.error(`Error querying all species: ${err.message}`)
          return reject(err)
        }

        if (allSpecies.length === 0) {
          db.close()
          log.info('No species data found')
          return resolve({ allSpecies: [], timeseries: [] })
        }

        // Query using recursive CTE to generate week series and join with observations
        const timeseriesQuery = `
          WITH date_range AS (
            SELECT
              date(min(substr(eventStart, 1, 10)), 'weekday 0') AS start_week,
              date(max(substr(eventStart, 1, 10)), 'weekday 0') AS end_week
            FROM observations
          ),
          weeks(week_start) AS (
            SELECT start_week FROM date_range
            UNION ALL
            SELECT date(week_start, '+7 days')
            FROM weeks, date_range
            WHERE week_start < end_week
          ),
          species_list AS (
            SELECT scientificName
            FROM observations
            WHERE scientificName IS NOT NULL AND scientificName != ''
            GROUP BY scientificName
          ),
          week_species_combinations AS (
            SELECT
              weeks.week_start,
              species_list.scientificName
            FROM weeks
            CROSS JOIN species_list
          ),
          weekly_counts AS (
            SELECT
              date(substr(eventStart, 1, 10), 'weekday 0') as observation_week,
              scientificName,
              COUNT(*) as count
            FROM observations
            WHERE scientificName IS NOT NULL AND scientificName != ''
            GROUP BY observation_week, scientificName
          )
          SELECT
            wsc.week_start as date,
            wsc.scientificName,
            COALESCE(wc.count, 0) as count
          FROM week_species_combinations wsc
          LEFT JOIN weekly_counts wc ON wsc.week_start = wc.observation_week
            AND wsc.scientificName = wc.scientificName
          ORDER BY wsc.week_start ASC, wsc.scientificName
        `

        db.all(timeseriesQuery, [], (err, timeseries) => {
          db.close()

          if (err) {
            log.error(`Error querying timeseries: ${err.message}`)
            return reject(err)
          }

          // Process the SQL results into the expected format
          const processedData = processTimeseriesDataFromSql(timeseries)

          log.info(`Retrieved timeseries data: ${processedData.length} weeks for all species`)
          resolve({
            allSpecies: allSpecies,
            timeseries: processedData
          })
        })
      })
    })
  })
}

/**
 * Get daily timeseries data for specific species
 * @param {string} dbPath - Path to the SQLite database
 * @param {Array<string>} speciesNames - List of scientific names to include
 * @returns {Promise<Object>} - Timeseries data for specified species
 */
export async function getSpeciesTimeseries(dbPath, speciesNames = []) {
  return new Promise((resolve, reject) => {
    log.info(`Querying species timeseries from: ${dbPath} for specific species`)
    log.info(`Selected species: ${speciesNames.join(', ')}`)

    // Open the database
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        log.error(`Error opening database: ${err.message}`)
        return reject(err)
      }

      // Prepare IN clause for selected species if provided
      let speciesClause = ''
      let speciesFilter = ''

      if (speciesNames && speciesNames.length > 0) {
        const quotedSpecies = speciesNames.map((name) => `'${name.replace(/'/g, "''")}'`).join(',')
        speciesClause = `WHERE scientificName IN (${quotedSpecies})`
        speciesFilter = `AND scientificName IN (${quotedSpecies})`
      }

      // Query using recursive CTE to generate week series and join with observations
      const timeseriesQuery = `
        WITH date_range AS (
          SELECT
            date(min(substr(eventStart, 1, 10)), 'weekday 0') AS start_week,
            date(max(substr(eventStart, 1, 10)), 'weekday 0') AS end_week
          FROM observations
        ),
        weeks(week_start) AS (
          SELECT start_week FROM date_range
          UNION ALL
          SELECT date(week_start, '+7 days')
          FROM weeks, date_range
          WHERE week_start < end_week
        ),
        species_list AS (
          SELECT
            scientificName,
            COUNT(*) as count
          FROM observations
          WHERE scientificName IS NOT NULL AND scientificName != ''
          ${speciesFilter ? speciesFilter : ''}
          GROUP BY scientificName
        ),
        week_species_combinations AS (
          SELECT
            weeks.week_start,
            species_list.scientificName
          FROM weeks
          CROSS JOIN species_list
        ),
        weekly_counts AS (
          SELECT
            date(substr(eventStart, 1, 10), 'weekday 0') as observation_week,
            scientificName,
            COUNT(*) as count
          FROM observations
          WHERE scientificName IS NOT NULL AND scientificName != ''
          ${speciesFilter ? speciesFilter : ''}
          GROUP BY observation_week, scientificName
        )
        SELECT
          wsc.week_start as date,
          wsc.scientificName,
          COALESCE(wc.count, 0) as count,
          sl.count as total_count
        FROM week_species_combinations wsc
        LEFT JOIN weekly_counts wc ON wsc.week_start = wc.observation_week
          AND wsc.scientificName = wc.scientificName
        JOIN species_list sl ON wsc.scientificName = sl.scientificName
        ORDER BY wsc.week_start ASC, wsc.scientificName
      `

      db.all(timeseriesQuery, [], (err, timeseries) => {
        db.close()

        if (err) {
          log.error(`Error querying timeseries: ${err.message}`)
          return reject(err)
        }

        // Process the SQL results into the expected format
        const processedData = processTimeseriesDataFromSql(timeseries)

        // Extract species metadata from the timeseries data
        const speciesMap = new Map()
        timeseries.forEach((row) => {
          if (!speciesMap.has(row.scientificName)) {
            speciesMap.set(row.scientificName, {
              scientificName: row.scientificName,
              count: row.total_count
            })
          }
        })

        // Convert the map to an array and sort by count descending
        const speciesData = Array.from(speciesMap.values()).sort((a, b) => b.count - a.count)

        log.info(
          `Retrieved timeseries data: ${processedData.length} weeks for ${speciesData.length} species`
        )
        resolve({
          allSpecies: speciesData,
          timeseries: processedData
        })
      })
    })
  })
}

/**
 * Get species geolocation data for heatmap visualization
 * @param {string} dbPath - Path to the SQLite database
 * @param {Array<string>} species - List of scientific names to include
 * @param {string} startDate - ISO date string for range start
 * @param {string} endDate - ISO date string for range end
 * @param {number} startHour - Starting hour of day (0-24)
 * @param {number} endHour - Ending hour of day (0-24)
 * @returns {Promise<Object>} - Species geolocation data for heatmap
 */
export async function getSpeciesHeatmapData(
  dbPath,
  species,
  startDate,
  endDate,
  startHour = 0,
  endHour = 24
) {
  return new Promise((resolve, reject) => {
    log.info(`Querying species heatmap data from: ${dbPath}`)
    log.info(`Date range: ${startDate} to ${endDate}`)
    log.info(`Time range: ${startHour} to ${endHour} hours`)
    log.info(`Species: ${species.join(', ')}`)

    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        log.error(`Error opening database: ${err.message}`)
        return reject(err)
      }

      // Extract species names for the IN clause with proper escaping
      const speciesNames = species.map((s) => `'${s.replace(/'/g, "''")}'`).join(',')

      // Time of day query condition
      let timeCondition = ''
      if (startHour < endHour) {
        // Simple range (e.g., 8:00 to 17:00)
        timeCondition = `
          AND CAST(strftime('%H', o.eventStart) AS INTEGER) >= ${startHour}
          AND CAST(strftime('%H', o.eventStart) AS INTEGER) < ${endHour}
        `
      } else if (startHour > endHour) {
        // Wrapping range (e.g., 22:00 to 6:00)
        timeCondition = `
          AND CAST(strftime('%H', o.eventStart) AS INTEGER) >= ${startHour}
          OR CAST(strftime('%H', o.eventStart) AS INTEGER) < ${endHour}
        `
      }
      // If startHour equals endHour, we include all hours (full day)

      // Query to get observation counts by location and species
      const query = `
        SELECT
          d.locationName,
          d.latitude,
          d.longitude,
          o.scientificName,
          COUNT(*) as count
        FROM observations o
        JOIN deployments d ON o.deploymentID = d.deploymentID
        WHERE
          o.scientificName IN (${speciesNames})
          AND o.eventStart >= ?
          AND o.eventStart <= ?
          AND d.latitude IS NOT NULL
          AND d.longitude IS NOT NULL
          ${timeCondition}
        GROUP BY d.latitude, d.longitude, o.scientificName
        ORDER BY count DESC
      `

      db.all(query, [startDate, endDate], (err, rows) => {
        db.close()

        if (err) {
          log.error(`Error querying species heatmap data: ${err.message}`)
          return reject(err)
        }

        // Process the data to create species-specific datasets
        const speciesData = {}
        species.forEach((s) => {
          speciesData[s] = []
        })

        rows.forEach((row) => {
          if (speciesData[row.scientificName]) {
            speciesData[row.scientificName].push({
              lat: parseFloat(row.latitude), // Convert to number here
              lng: parseFloat(row.longitude), // Convert to number here
              count: row.count,
              locationName: row.locationName
            })
          }
        })

        log.info(`Retrieved heatmap data: ${rows.length} location points`)
        resolve(speciesData)
      })
    })
  })
}

/**
 * Get the latest media files from the database that have animal observations
 * @param {string} dbPath - Path to the SQLite database
 * @param {number} limit - Maximum number of media files to return
 * @returns {Promise<Array>} - Media files with filePath and mediaID that have animal observations
 */
export async function getLatestMedia(dbPath, limit = 10) {
  return new Promise((resolve, reject) => {
    log.info(`Querying latest ${limit} media files with animal observations from: ${dbPath}`)

    // Open the database
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        log.error(`Error opening database: ${err.message}`)
        return reject(err)
      }

      // Query to get the latest media files with animal observations
      // Joins media with observations based on matching timestamp and eventStart
      const query = `
        SELECT DISTINCT
          m.mediaID,
          m.filePath,
          m.fileName,
          m.timestamp,
          o.scientificName
        FROM media m
        JOIN observations o ON m.timestamp = o.eventStart
        WHERE o.scientificName IS NOT NULL
          AND o.scientificName != ''
          AND o.scientificName != 'Homo sapiens'
        ORDER BY m.timestamp DESC
        LIMIT ?
      `

      db.all(query, [limit], (err, rows) => {
        // Close the database
        db.close()

        if (err) {
          log.error(`Error querying media with observations: ${err.message}`)
          return reject(err)
        }

        log.info(`Retrieved ${rows.length} media files with animal observations`)
        resolve(rows)
      })
    })
  })
}

/**
 * Get hourly activity data for species
 * @param {string} dbPath - Path to the SQLite database
 * @param {Array<string>} species - List of scientific names to include
 * @param {string} startDate - ISO date string for range start
 * @param {string} endDate - ISO date string for range end
 * @returns {Promise<Object>} - Hourly activity data for specified species
 */
export async function getSpeciesDailyActivity(dbPath, species, startDate, endDate) {
  return new Promise((resolve, reject) => {
    log.info(`Querying species daily activity from: ${dbPath}`)
    log.info(`Date range: ${startDate} to ${endDate}`)
    log.info(`Species: ${species.join(', ')}`)

    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        log.error(`Error opening database: ${err.message}`)
        return reject(err)
      }

      // Extract species names for the IN clause with proper escaping
      const speciesNames = species.map((s) => `'${s.replace(/'/g, "''")}'`).join(',')

      // Query to get observation counts by hour and species
      const query = `
        SELECT
          CAST(strftime('%H', eventStart) AS INTEGER) as hour,
          scientificName,
          COUNT(*) as count
        FROM observations
        WHERE
          scientificName IN (${speciesNames})
          AND eventStart >= ?
          AND eventStart <= ?
        GROUP BY hour, scientificName
        ORDER BY hour, scientificName
      `

      db.all(query, [startDate, endDate], (err, rows) => {
        db.close()

        if (err) {
          log.error(`Error querying species daily activity data: ${err.message}`)
          return reject(err)
        }

        // Process the data to create species-specific hourly patterns
        const hourlyData = Array(24)
          .fill()
          .map((_, i) => ({
            hour: i,
            // Initialize with 0 for each species
            ...Object.fromEntries(species.map((s) => [s, 0]))
          }))

        // Fill in the actual data from the query results
        rows.forEach((row) => {
          hourlyData[row.hour][row.scientificName] = row.count
        })

        log.info(`Retrieved daily activity data: ${rows.length} hour/species combinations`)
        resolve(hourlyData)
      })
    })
  })
}

// Helper function to process timeseries data from SQL query
function processTimeseriesDataFromSql(rawData) {
  const resultMap = new Map()

  // Group by date and collect counts for each species
  rawData.forEach((entry) => {
    if (!resultMap.has(entry.date)) {
      resultMap.set(entry.date, {})
    }
    const dateEntry = resultMap.get(entry.date)
    dateEntry[entry.scientificName] = entry.count
  })

  // Convert map to array format
  return Array.from(resultMap.entries())
    .map(([date, speciesCounts]) => ({
      date,
      ...speciesCounts
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
