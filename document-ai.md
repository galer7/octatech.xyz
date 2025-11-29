1. "compile time"

- we process all the documents ahead of time and embed them
output: vectors

- when we want to fill the form/json, we query these vectors/embeddings

2. "run time"

- when we want to fill the form/json, an llm/agent performs search at that given time

pros:
- (maybe) higher accuracy

cons:
- takes more time

3. compile + run time (hybrid)

example agent output:

1. Sure, in order to find the user's full name, I need to search the document for the pattern "$full_name"

2.

{
  "type": "function_call",
  "function_name": "search_document_by_pattern",
  "function_args": {
    "pattern": "$full_name"
  }
}
